import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/enums/role.enum';
import { CertAppService } from './cert-app.service';
import { CertQuickAppService } from './cert-quick-app.service';
import { CertShopGuard, ShopUser } from './cert-shop.guard';
import { CertSignService } from './cert-sign.service';
import { StartSignDto } from './dto/cert-shop.dto';

type Authed = Request & { user: ShopUser };
/** 'metus' là app chính của shop (CertAppService), khác chỗ lưu với các app ký nhanh. */
const MAIN_SLUG = 'metus';

/** Công cụ ký IPA: mọi tài khoản đăng nhập đều dùng được, với chứng chỉ của chính họ (mua ở shop hoặc nơi khác). */
@Public()
@Controller('cert-shop/sign')
export class CertSignController {
  constructor(
    private readonly sign: CertSignService,
    private readonly quickApps: CertQuickAppService,
    private readonly apps: CertAppService,
  ) {}

  // Các app có sẵn để chọn nhanh làm nguồn ký (app chính của shop + các app ký nhanh như ESign),
  // thay vì tự tải file lên.
  @UseGuards(CertShopGuard)
  @Get('quick-apps')
  async listQuickApps() {
    const [main, quicks] = await Promise.all([this.apps.info(), this.quickApps.list()]);
    return [
      ...(main
        ? [{ slug: MAIN_SLUG, name: main.name, version: main.version, bundleId: main.bundleId, minOs: main.minOs, size: main.size }]
        : []),
      ...quicks,
    ];
  }

  /** Dùng một app có sẵn trên server làm IPA nguồn cho lượt ký, không cần khách tải file lên. */
  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Put('jobs/:id/quick-app/:slug')
  async putQuickApp(@Req() req: Authed, @Param('id') id: string, @Param('slug') slug: string) {
    const job = this.sign.get(id, req.user.id);
    if (slug === MAIN_SLUG) {
      const a = await this.apps.info();
      if (!a) throw new NotFoundException('Không tìm thấy app này');
      await this.sign.useAppFile(job, a.path, { bundleId: a.bundleId, name: a.name, version: a.version });
      return { ok: true, app: a };
    }
    const found = await this.quickApps.resolve(slug);
    if (!found) throw new NotFoundException('Không tìm thấy app này');
    if (found.path) {
      await this.sign.useAppFile(job, found.path, {
        bundleId: found.info.bundleId ?? '',
        name: found.info.name,
        version: found.info.version ?? '',
      });
    } else {
      // App nhập từ repo.json, chưa tải sẵn: BE tải thẳng từ downloadURL vào lượt ký lúc này.
      await this.sign.useRemoteFile(job, found.downloadURL!);
    }
    return { ok: true, app: found.info };
  }

  private async assertReady() {
    if (!(await this.sign.ready())) throw new ServiceUnavailableException('Công cụ ký chưa sẵn sàng, vui lòng quay lại sau');
  }

  @UseGuards(CertShopGuard)
  @Get('status')
  async status(@Req() req: Authed) {
    return {
      signerReady: await this.sign.ready(),
      maxMb: this.sign.maxIpaBytes / 1048576,
      // null = không giới hạn (admin)
      quotaLeft: this.sign.quotaLeft(req.user.id, req.user.role === Role.Admin),
    };
  }

  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('jobs')
  async create(@Req() req: Authed) {
    await this.assertReady();
    const job = await this.sign.create(req.user.id);
    return { id: job.id };
  }

  // Hai file đi riêng bằng nội dung thô (không multipart) để ghi thẳng xuống đĩa, không giữ trong RAM.
  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Put('jobs/:id/ipa')
  async putIpa(@Req() req: Authed, @Param('id') id: string) {
    const meta = await this.sign.saveIpa(this.sign.get(id, req.user.id), req);
    return { ok: true, app: meta };
  }

  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Put('jobs/:id/cert')
  async putCert(@Req() req: Authed, @Param('id') id: string) {
    await this.sign.saveCert(this.sign.get(id, req.user.id), req);
    return { ok: true };
  }

  // Nhập chứng chỉ thủ công: .p12 và .mobileprovision gửi riêng, thay cho gói .zip.
  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Put('jobs/:id/p12')
  async putP12(@Req() req: Authed, @Param('id') id: string) {
    await this.sign.saveP12(this.sign.get(id, req.user.id), req);
    return { ok: true };
  }

  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Put('jobs/:id/profile')
  async putProfile(@Req() req: Authed, @Param('id') id: string) {
    await this.sign.saveProfile(this.sign.get(id, req.user.id), req);
    return { ok: true };
  }

  @UseGuards(CertShopGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('jobs/:id/start')
  async start(@Req() req: Authed, @Param('id') id: string, @Body() dto: StartSignDto) {
    await this.assertReady();
    const job = this.sign.start(
      this.sign.get(id, req.user.id),
      {
        password: dto.password,
        bundleId: dto.bundleId?.trim() || undefined,
        name: dto.name?.trim() || undefined,
      },
      req.user.role === Role.Admin,
    );
    return this.sign.view(job);
  }

  @UseGuards(CertShopGuard)
  @Get('jobs/:id')
  async view(@Req() req: Authed, @Param('id') id: string) {
    return this.sign.view(this.sign.get(id, req.user.id, req.user.role === Role.Admin));
  }

  // ---- Liên kết tải/cài: iOS gọi không kèm cookie nên dùng mã bí mật trong đường dẫn ----
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('dl/:token/manifest.plist')
  async manifest(@Param('token') token: string, @Res() res: Response) {
    const job = this.sign.byToken(token);
    res.set({ 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' }).send(await this.sign.manifest(job));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('dl/:token/app.ipa')
  download(@Param('token') token: string, @Res() res: Response) {
    const job = this.sign.byToken(token);
    const safe = (job.signed?.name || 'app').replace(/[^A-Za-z0-9._-]+/g, '-');
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(job.signed?.size ?? ''),
      'Content-Disposition': `attachment; filename="${safe}-signed.ipa"`,
      'Cache-Control': 'no-store',
    });
    createReadStream(this.sign.path(job)).on('error', () => res.destroy()).pipe(res);
  }
}
