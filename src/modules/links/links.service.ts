import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Link, LinkDocument } from './schemas/link.schema';
import { LinkPlansService, periodStart } from './link-plans.service';
import { LinkDomainsService } from './link-domains.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  buildOnelink,
  isTikTokUrl,
  newCode,
  parseTarget,
  resolveShort,
} from './tiktok.util';

/** Dữ liệu công khai đủ để dựng trang /s/<code>. */
export type PublicLink = {
  code: string;
  kind: 'product' | 'campaign';
  title: string;
  image: string;
  webUrl: string;
  androidUrl: string;
  iosUrl: string;
};

const PERIOD_VI = { day: 'ngày', week: 'tuần', month: 'tháng' } as const;

@Injectable()
export class LinksService {
  constructor(
    @InjectModel(Link.name) private readonly model: Model<LinkDocument>,
    private readonly plans: LinkPlansService,
    private readonly domains: LinkDomainsService,
  ) {}

  /** Số link đã tạo từ đầu chu kỳ; tính cả link xóa mềm để không lách hạn mức bằng xóa rồi tạo lại. */
  private usedSince(ownerId: string, since: Date): Promise<number> {
    return this.model.countDocuments({ ownerId, createdAt: { $gte: since } });
  }

  /** Hạn mức hiện tại theo gói link của người dùng; admin không giới hạn. */
  async quota(user: AuthUser) {
    const { plan, expiresAt } = await this.plans.planFor(user.id);
    const used = await this.usedSince(user.id, periodStart(plan.period));
    const plansInfo = { code: plan.code, name: plan.name, expiresAt };
    if (user.role === Role.Admin) {
      return { plan: plansInfo, period: plan.period, limit: null, used, remaining: null };
    }
    return {
      plan: plansInfo,
      period: plan.period,
      limit: plan.limit,
      used,
      remaining: Math.max(plan.limit - used, 0),
    };
  }

  async create(user: AuthUser, dto: CreateLinkDto) {
    if (user.role !== Role.Admin) {
      const { plan } = await this.plans.planFor(user.id);
      const used = await this.usedSince(user.id, periodStart(plan.period));
      if (used >= plan.limit) {
        throw new HttpException(
          `Gói ${plan.name} đã hết ${plan.limit} link/${PERIOD_VI[plan.period]}. Nâng cấp gói hoặc thử lại ở chu kỳ sau`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Chọn và kiểm tra domain theo gói trước khi làm việc nặng (gọi TikTok).
    const domain = await this.domains.pickForNewLink(user, dto.domain);

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
      throw new BadRequestException(
        'Chỉ hỗ trợ link sản phẩm (/view/product/…) hoặc chiến dịch (/caravel/campaign…)',
      );
    }

    const title =
      dto.title?.trim() ||
      target.title ||
      (target.kind === 'campaign'
        ? 'Ưu đãi trên TikTok Shop'
        : 'Sản phẩm TikTok Shop');

    for (let i = 0; i < 5; i++) {
      try {
        const doc = await this.model.create({
          code: newCode(),
          kind: target.kind,
          webUrl,
          appLink: target.appLink,
          productId: target.productId ?? '',
          campaignId: target.campaignId ?? '',
          title,
          image: target.image,
          ownerId: user.id,
          domain,
        });
        return doc.toJSON();
      } catch (e) {
        // 11000 = trùng code (rất hiếm) -> thử mã khác
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    }
    throw new BadRequestException('Không tạo được mã link, thử lại');
  }

  /** Admin xem tất cả; người dùng thường chỉ xem link của mình. */
  async list(user: AuthUser, limit = 200, status: 'active' | 'archived' = 'active') {
    const filter: Record<string, unknown> = {
      deletedAt: null,
      archivedAt: status === 'archived' ? { $ne: null } : null,
    };
    if (user.role !== Role.Admin) filter.ownerId = user.id;
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 500));
    return docs.map((d) => d.toJSON());
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
    doc.deletedAt = new Date();
    await doc.save();
    return { ok: true };
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
    if (count) await this.model.updateOne({ _id: doc._id }, { $inc: { clicks: 1 } });
    return {
      code: doc.code,
      kind: doc.kind,
      title: doc.title,
      image: doc.image,
      webUrl: doc.webUrl,
      androidUrl: doc.appLink,
      iosUrl: buildOnelink(doc.appLink),
    };
  }
}
