import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { Link, LinkDocument } from './schemas/link.schema';
import { FREE_PLAN_CODE, LinkPlansService, periodStart } from './link-plans.service';
import { LinkDomainsService } from './link-domains.service';
import { resolveShopee } from './shopee.util';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';
import type { LinkExtrasDto } from './dto/link-extras.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  buildOnelink,
  isReservedCode,
  isTikTokUrl,
  newCode,
  parseTarget,
  resolveShort,
  validateImageUrl,
  validateNormalUrl,
} from './tiktok.util';

/** Dữ liệu công khai đủ để dựng trang /s/<code>. */
export type PublicLink = {
  code: string;
  kind: 'product' | 'campaign' | 'url' | 'shopee';
  title: string;
  description: string;
  redirectType: 'direct' | 'interstitial';
  image: string;
  webUrl: string;
  androidUrl: string;
  iosUrl: string;
  hasPassword: boolean;
  /** Link thường có đích là deeplink của hệ thống: dữ liệu App Links của deeplink để trang trung gian khai báo thẻ al:*. */
  appLinks?: { androidUrl: string; iosUrl: string; webUrl: string };
  /** Dấu vân tay của mật khẩu hiện tại: đổi mật khẩu thì đổi, để vô hiệu cookie mở khóa cũ. */
  lockId: string;
  /** Deeplink Shopee: link Shopee gốc, /<mã> chuyển 301 thẳng tới đây. */
  sourceUrl?: string;
  /** Link của gói Free đã quá hạn dùng: trang công khai hiện thông báo nâng cấp, không chuyển hướng. */
  expired?: boolean;
  geoRules: { country: string; region?: string; url: string }[];
  deviceRules: { device: string; url: string }[];
  langRules: { lang: string; url: string }[];
  params: { key: string; value: string }[];
};

type Extras = Partial<Pick<Link, 'passwordHash' | 'geoRules' | 'deviceRules' | 'langRules' | 'params'>>;

/** Giới hạn thử mật khẩu: tối đa 8 lần sai / 10 phút cho mỗi (link, IP). Lưu trong bộ nhớ tiến trình. */
const UNLOCK_MAX = 8;
const UNLOCK_WINDOW_MS = 10 * 60_000;

/** Link TikTok không phải sản phẩm/chiến dịch: không tạo được deeplink (link thường vẫn rút gọn bình thường). */
class UnsupportedTikTokTarget extends BadRequestException {}

const PERIOD_VI = { day: 'ngày', week: 'tuần', month: 'tháng' } as const;

@Injectable()
export class LinksService {
  constructor(
    @InjectModel(Link.name) private readonly model: Model<LinkDocument>,
    private readonly plans: LinkPlansService,
    private readonly domains: LinkDomainsService,
    private readonly config: ConfigService,
  ) {}

  private readonly unlockFails = new Map<string, { n: number; until: number }>();

  /**
   * Kiểm tra và chuẩn hóa tùy chọn nâng cao (mật khẩu, quy tắc chuyển hướng, tham số). Chỉ trả về trường được gửi lên.
   * Mọi URL đích của quy tắc đi qua cùng bộ kiểm tra như URL chính.
   */
  private async buildExtras(dto: LinkExtrasDto): Promise<Extras> {
    const selfHosts = [...(await this.domains.allHosts()), 'link.metus.vn'];
    const url = (u: string) => {
      try {
        return validateNormalUrl(u, selfHosts);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Đường dẫn không hợp lệ');
      }
    };
    const out: Extras = {};
    if (dto.password !== undefined) {
      if (dto.password === '') out.passwordHash = '';
      else if (dto.password.length < 4) throw new BadRequestException('Mật khẩu tối thiểu 4 ký tự');
      else out.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.geoRules) {
      out.geoRules = dto.geoRules.map((r) => ({
        country: r.country.toUpperCase(),
        ...(r.region?.trim() && { region: r.region.trim() }),
        url: url(r.url),
      }));
    }
    if (dto.deviceRules) out.deviceRules = dto.deviceRules.map((r) => ({ device: r.device, url: url(r.url) }));
    if (dto.langRules) out.langRules = dto.langRules.map((r) => ({ lang: r.lang.toLowerCase(), url: url(r.url) }));
    if (dto.params) out.params = dto.params.map((p) => ({ key: p.key, value: p.value }));
    return out;
  }

  /** Số link đã tạo từ đầu chu kỳ; tính cả link xóa mềm để không lách hạn mức bằng xóa rồi tạo lại. */
  private usedSince(ownerId: string, since: Date, group: 'tiktok' | 'shopee' = 'tiktok'): Promise<number> {
    // Link thường (kind 'url') không giới hạn nên không tính vào hạn mức; deeplink TikTok và deeplink Shopee tính riêng.
    const kind = group === 'shopee' ? 'shopee' : { $in: ['product', 'campaign'] };
    return this.model.countDocuments({ ownerId, kind, createdAt: { $gte: since } });
  }

  /** Hạn mức hiện tại theo gói link của người dùng; admin không giới hạn. */
  async quota(user: AuthUser) {
    const { plan, expiresAt } = await this.plans.planFor(user.id);
    const used = await this.usedSince(user.id, periodStart(plan.period));
    const plansInfo = { code: plan.code, name: plan.name, expiresAt };
    const shopeeUsed = await this.usedSince(user.id, periodStart(plan.period), 'shopee');
    if (user.role === Role.Admin) {
      return {
        plan: plansInfo,
        period: plan.period,
        limit: null,
        used,
        remaining: null,
        disabled: false,
        shopee: { limit: null, used: shopeeUsed, remaining: null },
      };
    }
    // Gói free đã bị tắt và người dùng không có gói trả phí còn hạn: không còn hạn mức nào.
    const disabled = plan.code === FREE_PLAN_CODE && !plan.isActive;
    return {
      plan: plansInfo,
      period: plan.period,
      limit: disabled ? 0 : plan.limit,
      used,
      remaining: disabled ? 0 : Math.max(plan.limit - used, 0),
      disabled,
      shopee: {
        limit: disabled ? 0 : (plan.shopeeLimit ?? 0),
        used: shopeeUsed,
        remaining: disabled ? 0 : Math.max((plan.shopeeLimit ?? 0) - shopeeUsed, 0),
      },
    };
  }

  async create(user: AuthUser, dto: CreateLinkDto) {
    // Link thường không giới hạn: chỉ deeplink TikTok bị kiểm tra gói và hạn mức.
    if (dto.mode === 'shopee' && user.role !== Role.Admin) {
      const { plan } = await this.plans.planFor(user.id);
      if (plan.code === FREE_PLAN_CODE && !plan.isActive) {
        throw new HttpException('Gói miễn phí hiện đã tắt. Hãy mua một gói để tạo deeplink Shopee.', HttpStatus.FORBIDDEN);
      }
      const limit = plan.shopeeLimit ?? 0;
      const used = await this.usedSince(user.id, periodStart(plan.period), 'shopee');
      if (used >= limit) {
        throw new HttpException(
          limit === 0
            ? `Gói ${plan.name} không có deeplink Shopee. Hãy nâng cấp gói để dùng.`
            : `Gói ${plan.name} đã hết ${limit} deeplink Shopee/${PERIOD_VI[plan.period]}. Hãy nâng cấp gói hoặc thử lại ở chu kỳ sau`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    if ((dto.mode === undefined || dto.mode === 'deeplink') && user.role !== Role.Admin) {
      const { plan } = await this.plans.planFor(user.id);
      if (plan.code === FREE_PLAN_CODE && !plan.isActive) {
        throw new HttpException(
          'Gói miễn phí hiện đã tắt. Hãy mua một gói để tạo deeplink TikTok.',
          HttpStatus.FORBIDDEN,
        );
      }
      const used = await this.usedSince(user.id, periodStart(plan.period));
      if (used >= plan.limit) {
        throw new HttpException(
          `Gói ${plan.name} đã hết ${plan.limit} deeplink/${PERIOD_VI[plan.period]}. Link thường vẫn tạo không giới hạn; muốn thêm deeplink hãy nâng cấp gói hoặc thử lại ở chu kỳ sau`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Chọn và kiểm tra domain theo gói trước khi làm việc nặng (gọi TikTok).
    const domain = await this.domains.pickForNewLink(user, dto.domain);
    const expiresAt = await this.newLinkExpiry(user);

    if (dto.mode === 'normal') return this.createNormal(user, dto, domain, expiresAt);
    if (dto.mode === 'shopee') return this.createShopee(user, dto, domain, expiresAt);

    const input = dto.url.trim();
    if (!isTikTokUrl(input)) {
      throw new BadRequestException(
        'Chỉ nhận link https của tiktok.com (vt/vm/www)',
      );
    }

    let webUrl: string;
    try {
      webUrl = await resolveShort(input);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Không đọc được link',
      );
    }
    if (!isTikTokUrl(webUrl)) {
      throw new BadRequestException('Đích không thuộc TikTok');
    }

    const target = await parseTarget(webUrl);
    if (!target) {
      throw new UnsupportedTikTokTarget(
        'Chỉ hỗ trợ link sản phẩm (/view/product/…) hoặc chiến dịch (/caravel/campaign…)',
      );
    }

    const title =
      dto.title?.trim() ||
      target.title ||
      (target.kind === 'campaign'
        ? 'Ưu đãi trên TikTok Shop'
        : 'Sản phẩm TikTok Shop');

    return this.saveWithCode({
      kind: target.kind,
      webUrl,
      appLink: target.appLink,
      productId: target.productId ?? '',
      campaignId: target.campaignId ?? '',
      title,
      description: '',
      redirectType: 'interstitial' as const,
      note: '',
      image: target.image,
      ownerId: user.id,
      domain,
      expiresAt,
    });
  }

  /** Deeplink Shopee: link Shopee mở thẳng app Shopee (logic riêng, không dùng bộ đọc link của TikTok). */
  private async createShopee(user: AuthUser, dto: CreateLinkDto, domain: string, expiresAt: Date | null) {
    let t;
    try {
      t = await resolveShopee(dto.url.trim());
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Không đọc được link Shopee');
    }
    return this.saveWithCode({
      kind: 'shopee' as const,
      sourceUrl: dto.url.trim(),
      webUrl: t.webUrl,
      appLink: t.appLink,
      productId: '',
      campaignId: '',
      title: dto.title?.trim() || t.title || 'Sản phẩm Shopee',
      description: '',
      redirectType: 'interstitial' as const,
      note: '',
      image: t.image,
      ownerId: user.id,
      domain,
      expiresAt,
    });
  }

  /**
   * Rút gọn link thường: đích là đường dẫn http/https bất kỳ. Server KHÔNG tải trang đích (tránh bị lợi dụng
   * truy cập địa chỉ nội bộ); chỉ kiểm tra cú pháp và chặn đích nguy hiểm.
   */
  private async createNormal(user: AuthUser, dto: CreateLinkDto, domain: string, expiresAt: Date | null) {
    const selfHosts = [...(await this.domains.allHosts()), 'link.metus.vn'];
    let href: string;
    try {
      href = validateNormalUrl(dto.url, selfHosts);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Đường dẫn không hợp lệ');
    }
    let image = '';
    if (dto.image?.trim()) {
      try {
        image = validateImageUrl(dto.image);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Đường dẫn ảnh không hợp lệ');
      }
    }
    const extras = await this.buildExtras(dto);
    const alias = dto.alias?.trim().toLowerCase();
    if (alias && isReservedCode(alias)) {
      throw new BadRequestException('Tên này được hệ thống giữ riêng, hãy chọn tên khác');
    }
    // Kiểm tra tên tùy chỉnh trước khi tạo deeplink để không tạo thừa (lệch hạn mức) khi tên đã bị dùng.
    if (alias && (await this.model.exists({ code: alias }))) {
      throw new ConflictException('Tên tùy chỉnh này đã được sử dụng, hãy chọn tên khác');
    }

    // Người dùng nhập link TikTok Shop: tạo deeplink trước (tính vào hạn mức deeplink), rồi link thường trỏ tới
    // trang deeplink đó. Link TikTok khác (trang cá nhân…) không có deeplink nên vẫn rút gọn như link thường.
    let chained: Record<string, unknown> | null = null;
    let title = dto.title?.trim() || new URL(href).hostname;
    if (dto.autoDeeplink && isTikTokUrl(href)) {
      try {
        chained = (await this.create(user, { url: dto.url, mode: 'deeplink', domain: domain || undefined })) as Record<string, unknown>;
      } catch (e) {
        if (!(e instanceof UnsupportedTikTokTarget)) throw e;
      }
    }
    if (chained) {
      const host = (chained.domain as string) || this.config.get<string>('LINKS_DEFAULT_HOST', 'link.metus.vn');
      href = `https://${host}/s/${chained.code as string}`;
      title = dto.title?.trim() || (chained.title as string);
      // Không có ảnh riêng thì dùng ảnh sản phẩm của deeplink làm thẻ xem trước.
      if (!image && typeof chained.image === 'string' && chained.image) {
        try {
          image = validateImageUrl(chained.image);
        } catch {
          /* ảnh sản phẩm không hợp lệ thì bỏ qua */
        }
      }
    }

    try {
      const saved = await this.saveWithCode({
      kind: 'url' as const,
      webUrl: href,
      appLink: '',
      productId: '',
      campaignId: '',
      title,
      description: dto.description?.trim() ?? '',
      redirectType: dto.redirectType ?? 'interstitial',
      note: dto.note?.trim() ?? '',
      image,
      ownerId: user.id,
      domain,
      expiresAt,
      ...extras,
      }, alias);
      return chained ? { ...saved, deeplinkCode: chained.code as string } : saved;
    } catch (e) {
      // Link thường không tạo được thì hoàn lại deeplink vừa tạo để khỏi mất hạn mức vô ích.
      if (chained) await this.model.deleteOne({ _id: chained.id as string });
      throw e;
    }
  }

  /** Lưu link: có `alias` thì dùng đúng tên đó (trùng thì báo lỗi), không thì mã ngẫu nhiên (trùng rất hiếm -> thử lại). */
  private async saveWithCode(
    fields: Omit<Link, 'code' | 'clicks' | 'archivedAt' | 'deletedAt' | keyof Extras> & Extras,
    alias?: string,
  ) {
    if (alias) {
      try {
        const doc = await this.model.create({ ...fields, code: alias });
        return doc.toJSON();
      } catch (e) {
        if ((e as { code?: number }).code === 11000) {
          throw new ConflictException('Tên tùy chỉnh này đã được sử dụng, hãy chọn tên khác');
        }
        throw e;
      }
    }
    for (let i = 0; i < 5; i++) {
      try {
        const code = newCode();
        if (isReservedCode(code)) continue; // hiếm: mã ngẫu nhiên trùng tên trang của ứng dụng
        const doc = await this.model.create({ ...fields, code });
        return doc.toJSON();
      } catch (e) {
        // 11000 = trùng code -> thử mã khác
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    }
    throw new BadRequestException('Không tạo được mã link, thử lại');
  }

  /** Admin xem tất cả; người dùng thường chỉ xem link của mình. */
  async list(
    user: AuthUser,
    limit = 200,
    status: 'active' | 'archived' = 'active',
  ): Promise<Record<string, unknown>[]> {
    const filter: Record<string, unknown> = {
      deletedAt: null,
      archivedAt: status === 'archived' ? { $ne: null } : null,
    };
    if (user.role !== Role.Admin) filter.ownerId = user.id;
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 500));
    const rows = docs.map((d) => d.toJSON());
    if (user.role !== Role.Admin) {
      // Kèm hạn dùng hiệu lực và cờ hết hạn của gói Free để giao diện cảnh báo (link cũ chưa gán hạn thì tính từ ngày tạo).
      const exempt = await this.ownerExempt(user.id);
      const now = Date.now();
      return rows.map((r) => {
        const own = (r as { expiresAt?: Date | null }).expiresAt;
        const created = new Date((r as unknown as { createdAt: string }).createdAt).getTime();
        const eff = exempt ? null : own !== undefined ? own : new Date(created + this.freeLinkMs());
        return { ...r, expiresAt: eff, expired: !!eff && new Date(eff).getTime() <= now };
      });
    }

    // Admin: kèm tên đăng nhập và họ tên của chủ sở hữu để khỏi phải tra mã.
    const ids = [...new Set(rows.map((r) => r.ownerId).filter(Boolean))].flatMap((id) =>
      Types.ObjectId.isValid(id) ? [new Types.ObjectId(id)] : [],
    );
    const owners = ids.length
      ? await this.model.db
          .collection('users')
          .find({ _id: { $in: ids } }, { projection: { username: 1, fullName: 1 } })
          .toArray()
      : [];
    const byId = new Map(owners.map((o) => [String(o._id), o]));
    return rows.map((r) => {
      const o = byId.get(r.ownerId);
      return { ...r, owner: o ? { username: o.username as string, fullName: (o.fullName as string) ?? '' } : null };
    });
  }

  /** Số link đang hoạt động và đã lưu trữ (hiện ở thanh bên). Admin đếm tất cả; người dùng thường đếm link của mình. */
  async counts(user: AuthUser) {
    const base: Record<string, unknown> = { deletedAt: null };
    if (user.role !== Role.Admin) base.ownerId = user.id;
    const [active, archived] = await Promise.all([
      this.model.countDocuments({ ...base, archivedAt: null }),
      this.model.countDocuments({ ...base, archivedAt: { $ne: null } }),
    ]);
    return { active, archived };
  }

  /** Đổi tiêu đề và/hoặc lưu trữ/khôi phục. Admin sửa được mọi link; người dùng thường chỉ link của mình. */
  async update(user: AuthUser, id: string, dto: UpdateLinkDto) {
    const doc = await this.model.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundException('Không tìm thấy link');
    if (user.role !== Role.Admin && doc.ownerId !== user.id) {
      throw new ForbiddenException('Không có quyền sửa link này');
    }
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Tiêu đề không được để trống');
      doc.title = title;
    }
    if (doc.kind === 'url') {
      if (dto.description !== undefined) doc.description = dto.description.trim();
      if (dto.redirectType !== undefined) doc.redirectType = dto.redirectType;
      if (dto.note !== undefined) doc.note = dto.note.trim();
      Object.assign(doc, await this.buildExtras(dto));
      if (dto.image !== undefined) {
        if (!dto.image.trim()) doc.image = '';
        else {
          try {
            doc.image = validateImageUrl(dto.image);
          } catch (e) {
            throw new BadRequestException(e instanceof Error ? e.message : 'Đường dẫn ảnh không hợp lệ');
          }
        }
      }
    }
    if (dto.archived !== undefined) doc.archivedAt = dto.archived ? new Date() : null;
    await doc.save();
    return doc.toJSON();
  }

  /** Phân tích một link TikTok mà không lưu: cho biết loại, URL đích và deeplink sinh ra. */
  async inspect(url: string) {
    const input = url.trim();
    if (!isTikTokUrl(input)) {
      throw new BadRequestException('Chỉ nhận link https của tiktok.com (vt/vm/www)');
    }
    let webUrl: string;
    try {
      webUrl = await resolveShort(input);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Không đọc được link');
    }
    if (!isTikTokUrl(webUrl)) throw new BadRequestException('Đích không thuộc TikTok');
    const t = await parseTarget(webUrl);
    if (!t) {
      throw new BadRequestException(
        'Chỉ hỗ trợ link sản phẩm (/view/product/…) hoặc chiến dịch (/caravel/campaign…)',
      );
    }
    return {
      kind: t.kind,
      webUrl,
      androidUrl: t.appLink,
      iosUrl: buildOnelink(t.appLink),
      title: t.title,
      image: t.image,
      productId: t.productId ?? '',
      campaignId: t.campaignId ?? '',
    };
  }

  /** Admin xóa được mọi link; người dùng thường chỉ xóa link của mình. */
  async remove(user: AuthUser, id: string) {
    const doc = await this.model.findOne({ _id: id, deletedAt: null });
    if (!doc) throw new NotFoundException('Không tìm thấy link');
    if (user.role !== Role.Admin && doc.ownerId !== user.id) {
      throw new ForbiddenException('Không có quyền xóa link này');
    }
    // Gói Free không xóa được link (link tự hết hạn sau vài ngày); nâng cấp gói để xóa.
    if (user.role !== Role.Admin && (await this.plans.planFor(user.id)).plan.code === FREE_PLAN_CODE) {
      throw new ForbiddenException('Gói Miễn phí không xóa được link, hãy nâng cấp gói');
    }
    doc.deletedAt = new Date();
    await doc.save();
    return { ok: true };
  }

  /** Số ngày link của gói Free còn dùng được (đặt LINKS_FREE_LINK_DAYS để đổi). */
  private freeLinkMs(): number {
    const days = Number(this.config.get<string>('LINKS_FREE_LINK_DAYS', '3'));
    return (Number.isFinite(days) && days > 0 ? days : 3) * 86_400_000;
  }

  /** Chủ link không bị giới hạn hạn dùng: admin hoặc đang có gói trả phí còn hiệu lực. */
  private async ownerExempt(ownerId: string): Promise<boolean> {
    if (Types.ObjectId.isValid(ownerId)) {
      const u = await this.model.db
        .collection('users')
        .findOne({ _id: new Types.ObjectId(ownerId) }, { projection: { role: 1 } });
      if (u?.role === Role.Admin) return true;
    }
    return (await this.plans.planFor(ownerId)).plan.code !== FREE_PLAN_CODE;
  }

  /** Hạn dùng cho link mới của người dùng này: null nếu admin hoặc gói trả phí, ngược lại hạn của gói Free. */
  private async newLinkExpiry(user: AuthUser): Promise<Date | null> {
    if (user.role === Role.Admin) return null;
    const { plan } = await this.plans.planFor(user.id);
    return plan.code === FREE_PLAN_CODE ? new Date(Date.now() + this.freeLinkMs()) : null;
  }

  /** Dữ liệu công khai cho trang /s/<code>; `count` tăng bộ đếm lượt bấm. */
  async resolve(code: string, count: boolean, host?: string): Promise<PublicLink> {
    const doc = await this.model.findOne({ code, deletedAt: null, archivedAt: null });
    if (!doc) throw new NotFoundException('Link không tồn tại');
    // Link gắn với một domain thì chỉ mở được trên đúng domain đó (bỏ cổng :port khi so sánh).
    const reqHost = host?.toLowerCase().split(':')[0];
    if (doc.domain && reqHost && reqHost !== doc.domain) {
      throw new NotFoundException('Link không tồn tại');
    }

    // Hết hạn dùng của link Free. Link cũ chưa có trường này được gán hạn (tính từ ngày tạo) ở lần mở đầu tiên.
    let expiresAt = doc.expiresAt;
    if (expiresAt === undefined) {
      expiresAt = (await this.ownerExempt(doc.ownerId))
        ? null
        : new Date(((doc as unknown as { createdAt?: Date }).createdAt ?? doc._id.getTimestamp()).getTime() + this.freeLinkMs());
      await this.model.updateOne({ _id: doc._id, expiresAt: { $exists: false } }, { $set: { expiresAt } });
    }
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      // Chủ link đã nâng cấp sau khi gán hạn thì mở lại vĩnh viễn.
      if (await this.ownerExempt(doc.ownerId)) {
        await this.model.updateOne({ _id: doc._id }, { $set: { expiresAt: null } });
      } else {
        return {
          code: doc.code,
          kind: doc.kind,
          title: doc.title,
          description: '',
          redirectType: 'direct',
          image: '',
          webUrl: '',
          androidUrl: '',
          iosUrl: '',
          hasPassword: false,
          lockId: '',
          geoRules: [],
          deviceRules: [],
          langRules: [],
          params: [],
          expired: true,
        };
      }
    }

    if (count) await this.model.updateOne({ _id: doc._id }, { $inc: { clicks: 1 } });
    // Link thường có đích là một deeplink của chính hệ thống (tạo tự động từ link TikTok): kèm dữ liệu App Links của deeplink
    // để trang trung gian khai báo thẻ al:* ngay trên đường dẫn được chia sẻ. Facebook chỉ mở thẳng app không cảnh báo
    // khi chính đường dẫn đó có thẻ này; nhảy sang trang deeplink bằng JavaScript thì không đủ.
    let appLinks: PublicLink['appLinks'];
    if (doc.kind === 'url') {
      const m = /^https:\/\/([^/?#]+)\/s\/([A-Za-z0-9_-]+)\/?$/.exec(doc.webUrl);
      if (m) {
        const hosts = [...(await this.domains.allHosts()), this.config.get<string>('LINKS_DEFAULT_HOST', 'link.metus.vn')];
        const target = hosts.includes(m[1].toLowerCase())
          ? await this.model.findOne({ code: m[2], deletedAt: null, archivedAt: null, kind: { $in: ['product', 'campaign'] } })
          : null;
        if (target) {
          appLinks = { androidUrl: target.appLink, iosUrl: buildOnelink(target.appLink), webUrl: target.webUrl };
        }
      }
    }
    return {
      code: doc.code,
      kind: doc.kind,
      title: doc.title,
      description: doc.description ?? '',
      redirectType: doc.redirectType ?? 'interstitial',
      image: doc.image,
      webUrl: doc.webUrl,
      ...(doc.kind === 'shopee' && { sourceUrl: doc.sourceUrl || doc.webUrl }),
      androidUrl: doc.appLink,
      // Deeplink Shopee dùng nguyên địa chỉ app; deeplink TikTok bọc qua onelink cho iOS.
      iosUrl: doc.kind === 'shopee' ? doc.appLink : doc.appLink ? buildOnelink(doc.appLink) : '',
      hasPassword: !!doc.passwordHash,
      lockId: doc.passwordHash ? createHash('sha256').update(doc.passwordHash).digest('hex').slice(0, 16) : '',
      geoRules: doc.geoRules ?? [],
      deviceRules: doc.deviceRules ?? [],
      langRules: doc.langRules ?? [],
      params: doc.params ?? [],
      ...(appLinks && { appLinks }),
    };
  }

  /** Kiểm tra mật khẩu của link được bảo vệ (gọi từ server Next). */
  async unlock(code: string, password: string, ip: string): Promise<{ ok: boolean }> {
    const key = `${code}|${ip}`;
    const now = Date.now();
    const f = this.unlockFails.get(key);
    if (f && f.until > now && f.n >= UNLOCK_MAX) {
      throw new HttpException('Nhập sai quá nhiều lần, hãy thử lại sau ít phút', HttpStatus.TOO_MANY_REQUESTS);
    }
    const doc = await this.model.findOne({ code, deletedAt: null, archivedAt: null });
    if (!doc) throw new NotFoundException('Link không tồn tại');
    // Link không có mật khẩu thì coi như mở được; vẫn so khớp bcrypt cho link có mật khẩu.
    const ok = !doc.passwordHash || (await bcrypt.compare(password, doc.passwordHash));
    if (ok) {
      this.unlockFails.delete(key);
    } else {
      const cur = f && f.until > now ? f : { n: 0, until: now + UNLOCK_WINDOW_MS };
      cur.n += 1;
      this.unlockFails.set(key, cur);
      if (this.unlockFails.size > 5000) {
        for (const [k, v] of this.unlockFails) if (v.until <= now) this.unlockFails.delete(k);
      }
    }
    return { ok };
  }
}
