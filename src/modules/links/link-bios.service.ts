import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LinkBio, LinkBioDocument } from './schemas/link-bio.schema';
import { SaveBioDto } from './dto/link-bio.dto';
import { FREE_PLAN_CODE, LinkPlansService } from './link-plans.service';
import { isReservedCode } from './tiktok.util';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class LinkBiosService {
  constructor(
    @InjectModel(LinkBio.name) private readonly model: Model<LinkBioDocument>,
    private readonly plans: LinkPlansService,
  ) {}

  /** Admin hoặc đang có gói trả phí còn hiệu lực: được xuất bản trang Bio. */
  private async canPublish(ownerId: string): Promise<boolean> {
    if (Types.ObjectId.isValid(ownerId)) {
      const u = await this.model.db
        .collection('users')
        .findOne({ _id: new Types.ObjectId(ownerId) }, { projection: { role: 1 } });
      if (u?.role === Role.Admin) return true;
    }
    return (await this.plans.planFor(ownerId)).plan.code !== FREE_PLAN_CODE;
  }

  async getMine(user: AuthUser) {
    const doc = await this.model.findOne({ ownerId: user.id });
    return { bio: doc ? doc.toJSON() : null, canPublish: await this.canPublish(user.id) };
  }

  async saveMine(user: AuthUser, dto: SaveBioDto) {
    const slug = dto.slug.toLowerCase();
    if (isReservedCode(slug) || ['bio', 'b', 'p', 'u'].includes(slug)) {
      throw new ConflictException('Tên này đã được hệ thống dùng, hãy chọn tên khác');
    }
    if (await this.model.exists({ slug, ownerId: { $ne: user.id } })) {
      throw new ConflictException('Tên trang này đã có người dùng, hãy chọn tên khác');
    }
    if (dto.published && !(await this.canPublish(user.id))) {
      throw new ForbiddenException('Gói Miễn phí không xuất bản được trang Bio, hãy nâng cấp gói');
    }
    const clean = (s?: string) => (s ?? '').trim();
    const data = {
      slug,
      template: dto.template,
      name: clean(dto.name),
      handle: clean(dto.handle),
      avatar: clean(dto.avatar),
      description: clean(dto.description),
      buttons: dto.buttons.map((b) => ({ title: clean(b.title), url: clean(b.url) })),
      products: dto.products.map((p) => ({
        title: clean(p.title),
        price: clean(p.price),
        image: clean(p.image),
        url: clean(p.url),
      })),
      published: dto.published,
    };
    try {
      const doc = await this.model.findOneAndUpdate(
        { ownerId: user.id },
        { $set: data },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      return doc.toJSON();
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new ConflictException('Tên trang này đã có người dùng');
      throw e;
    }
  }

  /** Dữ liệu công khai cho /bio/<slug>; `count` tăng lượt xem (Next chỉ bật khi không phải bot). Chủ trang hết gói trả phí thì không mở được. */
  async publicBySlug(slug: string, count: boolean) {
    const doc = await this.model.findOne({ slug: slug.toLowerCase(), published: true });
    if (!doc || !(await this.canPublish(doc.ownerId))) throw new NotFoundException('Trang không tồn tại');
    if (count) await this.model.updateOne({ _id: doc._id }, { $inc: { views: 1 } });
    return {
      slug: doc.slug,
      template: doc.template,
      name: doc.name,
      handle: doc.handle,
      avatar: doc.avatar,
      description: doc.description,
      buttons: doc.buttons ?? [],
      products: doc.products ?? [],
    };
  }
}
