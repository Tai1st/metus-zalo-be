import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Body,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { Public } from '../../common/decorators/public.decorator';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CertAppService } from './cert-app.service';
import { CertQuickAppService } from './cert-quick-app.service';
import { CertOrdersService } from './cert-orders.service';
import { CertSettingsService } from './cert-settings.service';
import { CertAdmin, CertShopGuard } from './cert-shop.guard';
import { ChungchiClient } from './chungchi.client';
import { AdminOrdersQuery, UpdateCertSettingsDto } from './dto/cert-shop.dto';
import {
  CertOrder,
  CertOrderDocument,
  CertOrderStatus,
} from './schemas/cert-order.schema';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Quản lý shop: chỉ Role.Admin (cùng admin Zalo). */
@Public()
@UseGuards(CertShopGuard)
@CertAdmin()
@Controller('cert-shop/admin')
export class CertAdminController {
  constructor(
    private readonly provider: ChungchiClient,
    private readonly orders: CertOrdersService,
    private readonly settings: CertSettingsService,
    private readonly apps: CertAppService,
    private readonly quickApps: CertQuickAppService,
    @InjectModel(CertOrder.name) private readonly orderModel: Model<CertOrderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @Get('orders')
  async list(@Query() q: AdminOrdersQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.q?.trim()) {
      const re = new RegExp(escapeRegex(q.q.trim()), 'i');
      // Tìm theo mã đơn, UDID, hoặc tên đăng nhập của khách.
      const users = await this.userModel.find({ username: re }).select('_id').limit(50);
      filter.$or = [
        { code: re },
        { udid: re },
        { userId: { $in: users.map((u) => String(u._id)) } },
      ];
    }
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.orderModel.countDocuments(filter),
    ]);
    const names = new Map(
      (await this.userModel.find({ _id: { $in: items.map((o) => o.userId) } }).select('username')).map(
        (u) => [String(u._id), u.username],
      ),
    );
    return {
      total,
      page,
      pageSize,
      items: items.map((o) => ({
        code: o.code,
        username: names.get(o.userId) ?? '(đã xóa)',
        udid: o.udid,
        device: o.device,
        planTitle: o.planTitle,
        price: o.price,
        costAmount: o.costAmount,
        costCurrency: o.costCurrency,
        status: o.status,
        error: o.error,
        providerOrderCode: o.providerOrderCode,
        createdAt: (o as unknown as { createdAt: Date }).createdAt,
        paidAt: o.paidAt,
      })),
    };
  }

  /** Cấu hình shop lưu trong DB (khóa bí mật không bao giờ trả ra). */
  @Get('settings')
  getSettings() {
    return this.settings.view();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateCertSettingsDto) {
    return this.settings.update(dto);
  }

  // ---- ứng dụng (IPA) phát hành cho khách đã mua chứng chỉ ----
  @Get('app')
  async getApp() {
    const a = await this.apps.info();
    if (!a) return { available: false, maxMb: this.apps.maxBytes / 1048576 };
    const { path: _path, ...rest } = a;
    return { available: true, maxMb: this.apps.maxBytes / 1048576, ...rest };
  }

  /**
   * Tải IPA lên: body là nội dung file thô (Content-Type: application/octet-stream),
   * thông tin app đi theo query. Không dùng multipart để ghi thẳng xuống đĩa, không giữ file trong RAM.
   */
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @Post('app/upload')
  async uploadApp(
    @Req() req: Request,
    @Query('name') name?: string,
    @Query('version') version?: string,
    @Query('bundleId') bundleId?: string,
    @Query('minOs') minOs?: string,
  ) {
    const v = (version ?? '').trim();
    if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(v)) {
      throw new BadRequestException('Phiên bản không hợp lệ (vd: 1.0.2)');
    }
    const clean = (s: string | undefined, max: number) => (s ?? '').trim().slice(0, max);
    const r = await this.apps.saveUpload(req, {
      name: clean(name, 60) || 'Metus Browser',
      version: v,
      bundleId: clean(bundleId, 120),
      minOs: clean(minOs, 12),
    });
    return { ok: true, ...r };
  }

  @HttpCode(200)
  @Delete('app')
  async removeApp() {
    await this.apps.remove();
    return { ok: true };
  }

  // ---- app ký nhanh (vd ESign) để khách chọn ở trang Ký IPA ----
  @Get('quick-apps')
  listQuickApps() {
    return this.quickApps.list();
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @Post('quick-apps/:slug')
  async uploadQuickApp(@Req() req: Request, @Param('slug') slug: string, @Query('name') name?: string) {
    const r = await this.quickApps.upload(slug, name ?? slug, req);
    return { ok: true, ...r };
  }

  @HttpCode(200)
  @Delete('quick-apps/:slug')
  async removeQuickApp(@Param('slug') slug: string) {
    await this.quickApps.remove(slug);
    return { ok: true };
  }

  @Get('stats')
  async stats() {
    const [byStatus, revenue, today, balance] = await Promise.all([
      this.orderModel.aggregate<{ _id: string; n: number }>([
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      this.orderModel.aggregate<{ price: number; cost: number }>([
        { $match: { status: CertOrderStatus.Completed } },
        {
          $group: {
            _id: null,
            price: { $sum: '$price' },
            // Chỉ cộng giá gốc VND để lãi không bị lẫn tiền tệ.
            cost: { $sum: { $cond: [{ $eq: ['$costCurrency', 'VND'] }, '$costAmount', 0] } },
          },
        },
      ]),
      this.orderModel.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.provider.balance().catch(() => null),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
    return {
      counts,
      totalOrders: byStatus.reduce((a, s) => a + s.n, 0),
      ordersToday: today,
      revenue: revenue[0]?.price ?? 0,
      profit: (revenue[0]?.price ?? 0) - (revenue[0]?.cost ?? 0),
      providerWallet: balance,
    };
  }

  /** Xác nhận đã nhận tiền, hoặc gửi lại đơn khi lần trước lỗi (vd: hết số dư ví). */
  @HttpCode(200)
  @Post('orders/:code/confirm')
  async confirm(@Param('code') code: string) {
    const order = await this.orderModel.findOne({ code });
    if (!order) throw new NotFoundException('Không tìm thấy đơn');
    const r = await this.orders.fulfill(String(order._id));
    return { status: r?.status, error: r?.error };
  }

  @HttpCode(200)
  @Post('orders/:code/cancel')
  async cancel(@Param('code') code: string) {
    const r = await this.orderModel.updateOne(
      { code, status: CertOrderStatus.AwaitingPayment },
      { status: CertOrderStatus.Cancelled },
    );
    if (!r.modifiedCount) throw new ConflictException('Chỉ hủy được đơn đang chờ thanh toán');
    return { status: CertOrderStatus.Cancelled };
  }

  /** Đồng bộ thủ công trạng thái từ nhà cung cấp — dùng khi webhook không tới và khách chưa mở lại trang đơn. */
  @HttpCode(200)
  @Post('orders/:code/sync')
  async syncOne(@Param('code') code: string) {
    const order = await this.orderModel.findOne({ code });
    if (!order) throw new NotFoundException('Không tìm thấy đơn');
    if (!order.providerOrderCode) throw new ConflictException('Đơn chưa được gửi sang nhà cung cấp');
    const r = await this.orders.syncFromProvider(order.providerOrderCode);
    return { status: r?.status, error: r?.error };
  }

  /** Chỉ xóa được đơn chưa từng động tới nhà cung cấp (chờ thanh toán/đã hủy/thất bại), tránh mất dấu vết đơn thật. */
  @HttpCode(200)
  @Delete('orders/:code')
  async removeOrder(@Param('code') code: string) {
    const r = await this.orderModel.deleteOne({
      code,
      status: { $in: [CertOrderStatus.AwaitingPayment, CertOrderStatus.Cancelled, CertOrderStatus.Failed] },
    });
    if (!r.deletedCount) throw new ConflictException('Chỉ xóa được đơn chờ thanh toán, đã hủy hoặc thất bại');
    return { ok: true };
  }
}
