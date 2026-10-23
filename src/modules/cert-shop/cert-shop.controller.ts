import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/enums/role.enum';
import { CertAppService } from './cert-app.service';
import { CertCheckService } from './cert-check.service';
import { CertOrdersService } from './cert-orders.service';
import { CertSettingsService, ShopSettings } from './cert-settings.service';
import { CertShopGuard, ShopUser } from './cert-shop.guard';
import { ChungchiClient } from './chungchi.client';
import { CheckCertDto, CreateOrderDto } from './dto/cert-shop.dto';
import { CertEnroll, CertEnrollDocument } from './schemas/cert-enroll.schema';
import {
  CertOrder,
  CertOrderDocument,
  CertOrderStatus,
} from './schemas/cert-order.schema';
import {
  buildMobileConfig,
  deviceFromProduct,
  parseDevicePlist,
  verifyWebhook,
} from './udid.util';

type Authed = Request & { user: ShopUser };
const MAX_ENROLL_BODY = 1024 * 1024;

@Public()
@Controller('cert-shop')
export class CertShopController {
  constructor(
    private readonly settings: CertSettingsService,
    private readonly provider: ChungchiClient,
    private readonly orders: CertOrdersService,
    private readonly apps: CertAppService,
    private readonly checker: CertCheckService,
    @InjectModel(CertOrder.name) private readonly orderModel: Model<CertOrderDocument>,
    @InjectModel(CertEnroll.name) private readonly enrollModel: Model<CertEnrollDocument>,
  ) {}

  // ---- gói ----
  @Get('plans')
  async plans() {
    const [plans, s] = await Promise.all([this.provider.plans(), this.settings.get()]);
    return {
      plans: plans.map((p) => ({
        id: String(p.id),
        title: p.title,
        receiveTime: p.receive_time ?? '',
        validity: p.validity ?? '',
        warranty: p.warranty ?? '',
        features: s.planFeatures,
        price: this.orders.sellPrice(p.amount, s),
        currency: 'VND',
      })),
    };
  }

  // ---- lấy UDID ----
  @UseGuards(CertShopGuard)
  @Get('udid/profile')
  async profile(@Req() req: Authed, @Res() res: Response) {
    const token = randomBytes(24).toString('hex');
    await this.enrollModel.create({ token, userId: req.user.id });
    const { siteUrl } = await this.settings.get();
    const xml = buildMobileConfig(`${siteUrl}/api/cert-shop/udid/enroll?t=${token}`);
    res
      .set({
        'Content-Type': 'application/x-apple-aspen-config',
        'Content-Disposition': 'attachment; filename="udid.mobileconfig"',
        'Cache-Control': 'no-store',
      })
      .send(xml);
  }

  // iPhone gọi (không có cookie), nên nhận diện user qua token trong URL.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('udid/enroll')
  async enroll(@Req() req: Request, @Res() res: Response, @Query('t') token?: string) {
    const info = parseDevicePlist(await readBody(req, MAX_ENROLL_BODY));
    if (!token || !info) throw new BadRequestException('Bad request');
    const enroll = await this.enrollModel.findOneAndUpdate({ token }, info);
    if (!enroll) throw new NotFoundException('Token không hợp lệ hoặc đã hết hạn');
    // BẮT BUỘC 301: 302/200 làm iPhone báo lỗi cài profile.
    res.redirect(301, `${(await this.settings.get()).siteUrl}/buy?e=${token}`);
  }

  @UseGuards(CertShopGuard)
  @Get('udid/enroll/:token')
  async enrollInfo(@Req() req: Authed, @Param('token') token: string) {
    const e = await this.enrollModel.findOne({ token, userId: req.user.id });
    if (!e?.udid) throw new NotFoundException('Chưa lấy được UDID');
    return { udid: e.udid, product: e.product, version: e.version };
  }

  // ---- đơn hàng ----
  @UseGuards(CertShopGuard)
  @Post('orders')
  async create(@Req() req: Authed, @Body() dto: CreateOrderDto) {
    const enroll = await this.enrollModel.findOne({
      token: dto.enrollToken,
      userId: req.user.id,
    });
    if (!enroll?.udid) throw new BadRequestException('Chưa lấy được UDID');

    // Giá lấy lại từ nhà cung cấp, không tin client.
    const [plans, s] = await Promise.all([this.provider.plans(), this.settings.get()]);
    const plan = plans.find((p) => String(p.id) === dto.planId);
    if (!plan) throw new NotFoundException('Gói không tồn tại');

    const order = await this.orderModel.create({
      code: this.orders.newCode(),
      userId: req.user.id,
      udid: enroll.udid,
      device: deviceFromProduct(enroll.product ?? ''),
      planId: String(plan.id),
      planTitle: plan.title,
      costAmount: plan.amount,
      costCurrency: plan.currency,
      price: this.orders.sellPrice(plan.amount, s),
      p12Password: dto.p12Password || this.orders.newP12Password(),
    });
    await this.enrollModel.deleteOne({ _id: enroll._id });
    return { code: order.code };
  }

  @UseGuards(CertShopGuard)
  @Get('orders')
  async mine(@Req() req: Authed) {
    const list = await this.orderModel.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return { orders: list.map((o) => this.view(o, false)) };
  }

  @UseGuards(CertShopGuard)
  @Get('orders/:code')
  async one(@Req() req: Authed, @Param('code') code: string) {
    const order = await this.owned(req.user, code);
    return this.view(order, true, await this.settings.get());
  }

  // Polling dự phòng khi webhook không tới (nhà cung cấp chỉ gửi webhook một lần).
  @UseGuards(CertShopGuard)
  @HttpCode(200)
  @Post('orders/:code/sync')
  async sync(@Req() req: Authed, @Param('code') code: string) {
    const order = await this.owned(req.user, code);
    if (order.providerOrderCode && order.status === CertOrderStatus.Provisioning) {
      await this.orders.syncFromProvider(order.providerOrderCode);
    }
    return { status: (await this.owned(req.user, code)).status };
  }

  @UseGuards(CertShopGuard)
  @HttpCode(200)
  @Post('orders/:code/check')
  async check(@Req() req: Authed, @Param('code') code: string) {
    const order = await this.owned(req.user, code);
    if (!order.providerOrderCode) throw new ConflictException('Đơn chưa được xử lý');
    return (await this.provider.checkCert(order.providerOrderCode)).certificate;
  }

  @UseGuards(CertShopGuard)
  @HttpCode(200)
  @Post('orders/:code/warranty')
  async warranty(@Req() req: Authed, @Param('code') code: string) {
    const order = await this.owned(req.user, code);
    if (!order.providerOrderCode) throw new ConflictException('Đơn chưa được xử lý');
    return this.provider.warranty(order.providerOrderCode);
  }

  @UseGuards(CertShopGuard)
  @Get('orders/:code/download')
  async download(@Req() req: Authed, @Param('code') code: string, @Res() res: Response) {
    const order = await this.owned(req.user, code);
    if (order.status !== CertOrderStatus.Completed || !order.downloadUrl) {
      throw new ConflictException('Chứng chỉ chưa sẵn sàng');
    }
    const upstream = await this.provider.download(order.downloadUrl);
    if (!upstream.ok || !upstream.body) {
      throw new NotFoundException('Không tải được file từ nhà cung cấp');
    }
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="cert-${order.udid}.zip"`,
      'Cache-Control': 'no-store',
    });
    Readable.fromWeb(upstream.body as never).pipe(res);
  }

  // ---- app Metus (IPA chưa ký) cho khách đã có chứng chỉ ----
  @UseGuards(CertShopGuard)
  @Get('app')
  async app(@Req() req: Authed) {
    const a = await this.apps.info();
    if (!a) return { available: false };
    return {
      available: true,
      name: a.name,
      version: a.version,
      bundleId: a.bundleId,
      minOs: a.minOs,
      size: a.size,
      canDownload: await this.canDownloadApp(req.user),
    };
  }

  @UseGuards(CertShopGuard)
  @Get('app/download')
  async appDownload(@Req() req: Authed, @Res() res: Response) {
    const a = await this.apps.info();
    if (!a) throw new NotFoundException('Chưa có ứng dụng để tải');
    if (!(await this.canDownloadApp(req.user))) {
      throw new ForbiddenException('Cần mua chứng chỉ để tải ứng dụng');
    }
    const safe = `${a.name}-${a.version}`.replace(/[^A-Za-z0-9._-]+/g, '-');
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(a.size),
      'Content-Disposition': `attachment; filename="${safe}.ipa"`,
      'Cache-Control': 'no-store',
    });
    createReadStream(a.path).on('error', () => res.destroy()).pipe(res);
  }

  // ---- tra cứu đơn công khai (UDID hoặc mã đơn) ----
  /** Chỉ trả trạng thái: không có mật khẩu .p12, link tải hay thông tin tài khoản; UDID được che bớt. */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Get('lookup')
  async lookup(@Query('q') q?: string) {
    const key = (q ?? '').trim();
    if (key.length < 6 || key.length > 64 || !/^[A-Za-z0-9-]+$/.test(key)) {
      throw new BadRequestException('Nhập UDID hoặc mã đơn hàng hợp lệ');
    }
    // Khớp chính xác (không tìm gần đúng) để không dò được đơn của người khác
    const list = await this.orderModel
      .find({ $or: [{ code: key.toUpperCase() }, { udid: new RegExp(`^${key.replace(/[^A-Za-z0-9-]/g, '')}$`, 'i') }] })
      .sort({ createdAt: -1 })
      .limit(10);
    const mask = (u: string) => (u.length > 12 ? `${u.slice(0, 8)}…${u.slice(-4)}` : u);
    return {
      orders: list.map((o) => ({
        code: o.code,
        planTitle: o.planTitle,
        udid: mask(o.udid),
        status: o.status,
        createdAt: (o as unknown as { createdAt: Date }).createdAt,
      })),
    };
  }

  // ---- kiểm tra chứng chỉ từ gói .zip (không cần là chứng chỉ mua ở shop) ----
  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('check')
  checkFile(@Body() dto: CheckCertDto) {
    return this.checker.check(dto.zip, dto.password);
  }

  // ---- webhook nhà cung cấp ----
  @HttpCode(200)
  @Post('webhooks/chungchi')
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: any) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const ok = verifyWebhook(
      (await this.settings.get()).webhookSecret,
      String(req.headers['x-webhook-timestamp'] ?? ''),
      raw,
      String(req.headers['x-webhook-signature'] ?? ''),
    );
    if (!ok) throw new BadRequestException('Bad signature');

    const code: string | undefined = body?.data?.order_code;
    if (!code) return { ok: true };
    if (body.event === 'order.failed' || body.event === 'order.cancelled') {
      await this.orderModel.updateOne(
        { providerOrderCode: code },
        { status: body.event === 'order.failed' ? CertOrderStatus.Failed : CertOrderStatus.Cancelled },
      );
    } else {
      // Không tin payload: lấy lại trạng thái từ API nhà cung cấp rồi mới ghi.
      await this.orders.syncFromProvider(code);
    }
    return { ok: true };
  }

  // ---- helpers ----
  /** Admin hoặc khách có ít nhất một đơn chứng chỉ đã hoàn tất. */
  private async canDownloadApp(user: ShopUser) {
    if (user.role === Role.Admin) return true;
    return Boolean(await this.orderModel.exists({ userId: user.id, status: CertOrderStatus.Completed }));
  }

  private async owned(user: ShopUser, code: string) {
    const order = await this.orderModel.findOne({ code });
    if (!order || (user.role !== Role.Admin && order.userId !== user.id)) {
      throw new NotFoundException('Không tìm thấy đơn');
    }
    return order;
  }

  private view(o: CertOrderDocument, detail: boolean, s?: ShopSettings) {
    return {
      code: o.code,
      udid: o.udid,
      device: o.device,
      planTitle: o.planTitle,
      price: o.price,
      currency: o.currency,
      status: o.status,
      hasProvider: Boolean(o.providerOrderCode),
      createdAt: (o as unknown as { createdAt: Date }).createdAt,
      ...(detail && {
        error: o.error,
        // Mật khẩu .p12 chỉ lộ khi cert đã sẵn sàng.
        p12Password: o.status === CertOrderStatus.Completed ? o.p12Password : undefined,
        payment:
          s && o.status === CertOrderStatus.AwaitingPayment ? this.orders.payment(o, s) : undefined,
      }),
    };
  }
}

function readBody(req: Request, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new BadRequestException('Body quá lớn'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
