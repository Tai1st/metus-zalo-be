import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { Model, Types } from 'mongoose';
import {
  LinkDomain,
  LinkDomainDocument,
} from './schemas/link-domain.schema';
import {
  AddCustomDomainDto,
  CreateSystemDomainDto,
  UpdateSystemDomainDto,
} from './dto/link-domain.dto';
import { LinkPlansService } from './link-plans.service';
import { CloudflareService } from './cloudflare.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

const HOST_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VERIFY_PREFIX = '_metus-verify';

/** Chuẩn hóa và kiểm tra tên miền: viết thường, không giao thức/đường dẫn/cổng, không phải IP. */
export function normalizeHost(input: string): string {
  const h = input.trim().toLowerCase();
  if (!HOST_RE.test(h)) {
    throw new BadRequestException(
      'Tên miền không hợp lệ (ví dụ: go.example.com, không kèm https:// hay đường dẫn)',
    );
  }
  return h;
}

@Injectable()
export class LinkDomainsService {
  constructor(
    @InjectModel(LinkDomain.name) private readonly model: Model<LinkDomainDocument>,
    private readonly plans: LinkPlansService,
    private readonly config: ConfigService,
    private readonly cf: CloudflareService,
  ) {}

  // ---------- Kho domain hệ thống (admin) ----------

  listSystem() {
    return this.model.find({ kind: 'system' }).sort({ isDefault: -1, host: 1 });
  }

  async createSystem(dto: CreateSystemDomainDto) {
    const host = normalizeHost(dto.host);
    if (await this.model.exists({ host })) {
      throw new ConflictException('Tên miền đã tồn tại');
    }
    if (dto.isDefault) await this.model.updateMany({ kind: 'system' }, { isDefault: false });
    return this.model.create({
      host,
      kind: 'system',
      status: dto.isActive === false ? 'disabled' : 'active',
      isDefault: !!dto.isDefault,
      verifiedAt: new Date(),
    });
  }

  async updateSystem(id: string, dto: UpdateSystemDomainDto) {
    const doc = await this.model.findOne({ _id: id, kind: 'system' });
    if (!doc) throw new NotFoundException('Không tìm thấy tên miền');
    if (dto.host !== undefined) {
      const host = normalizeHost(dto.host);
      if (host !== doc.host && (await this.model.exists({ host }))) {
        throw new ConflictException('Tên miền đã tồn tại');
      }
      doc.host = host;
    }
    if (dto.isActive !== undefined) doc.status = dto.isActive ? 'active' : 'disabled';
    if (dto.isDefault) {
      await this.model.updateMany({ kind: 'system' }, { isDefault: false });
      doc.isDefault = true;
    } else if (dto.isDefault === false) {
      doc.isDefault = false;
    }
    return doc.save();
  }

  /** Tắt domain hệ thống (link đã tạo trên domain này không còn mở được). */
  async disableSystem(id: string) {
    return this.updateSystem(id, { isActive: false });
  }

  // ---------- Domain riêng của người dùng ----------

  /** Gói của người dùng có cho thêm domain riêng không, tối đa mấy cái (admin: không giới hạn). */
  private async customLimit(user: AuthUser): Promise<number> {
    if (user.role === Role.Admin) return Number.POSITIVE_INFINITY;
    const { plan } = await this.plans.planFor(user.id);
    return plan.maxCustomDomains ?? 0;
  }

  listMine(user: AuthUser) {
    return this.model.find({ kind: 'custom', ownerId: user.id }).sort({ createdAt: -1 });
  }

  async addCustom(
    user: AuthUser,
    dto: AddCustomDomainDto,
  ): Promise<Record<string, unknown>> {
    const limit = await this.customLimit(user);
    if (limit <= 0) {
      throw new ForbiddenException('Gói hiện tại không hỗ trợ tên miền riêng, hãy nâng cấp gói');
    }
    const host = normalizeHost(dto.host);
    if (await this.model.exists({ host })) {
      throw new ConflictException('Tên miền đã được sử dụng');
    }
    const count = await this.model.countDocuments({ kind: 'custom', ownerId: user.id });
    if (count >= limit) {
      throw new ForbiddenException(`Gói hiện tại chỉ cho thêm tối đa ${limit} tên miền riêng`);
    }
    // Có Cloudflare: tạo zone, người dùng đổi nameserver; không có: xác minh bằng bản ghi TXT.
    const zone = this.cf.enabled ? await this.cf.createZone(host) : null;
    if (zone) {
      try {
        await this.cf.setupZone(zone.id, host, this.pointTo() || 'link.metus.vn');
      } catch (e) {
        await this.cf.deleteZone(zone.id);
        throw e;
      }
    }
    const doc = await this.model.create({
      host,
      kind: 'custom',
      ownerId: user.id,
      status: 'pending',
      verifyToken: randomBytes(16).toString('hex'),
      cfZoneId: zone?.id ?? '',
      nameServers: zone?.name_servers ?? [],
    });
    return { ...doc.toJSON(), dns: this.dnsInstructions(doc) };
  }

  /** Hướng dẫn DNS: bản ghi TXT chứng minh sở hữu, và (nếu cấu hình) đích trỏ về hệ thống. */
  dnsInstructions(d: Pick<LinkDomain, 'host' | 'verifyToken' | 'cfZoneId' | 'nameServers'>) {
    if (d.cfZoneId) return { nameServers: d.nameServers };
    return {
      txt: { name: `${VERIFY_PREFIX}.${d.host}`, value: d.verifyToken },
      pointTo: this.pointTo() || null,
    };
  }

  private pointTo(): string {
    return this.config.get<string>('LINKS_CNAME_TARGET', '');
  }

  async verify(user: AuthUser, id: string) {
    const doc = await this.model.findOne({ _id: id, kind: 'custom' });
    if (!doc) throw new NotFoundException('Không tìm thấy tên miền');
    if (user.role !== Role.Admin && doc.ownerId !== user.id) {
      throw new ForbiddenException('Không có quyền với tên miền này');
    }
    if (doc.status === 'active') return doc;

    if (doc.cfZoneId) {
      await this.cf.recheck(doc.cfZoneId);
      const zone = await this.cf.getZone(doc.cfZoneId);
      if (zone.status !== 'active') {
        throw new BadRequestException(
          'Chưa nhận được nameserver mới, hãy đổi nameserver tại nơi đăng ký tên miền rồi thử lại sau ít phút (có thể mất tới vài giờ)',
        );
      }
      await this.cf.setupZone(doc.cfZoneId, doc.host, this.pointTo() || 'link.metus.vn');
      doc.status = 'active';
      doc.verifiedAt = new Date();
      return doc.save();
    }

    let records: string[][] = [];
    try {
      records = await resolveTxt(`${VERIFY_PREFIX}.${doc.host}`);
    } catch {
      throw new BadRequestException('Chưa tìm thấy bản ghi TXT, kiểm tra DNS rồi thử lại sau ít phút');
    }
    const found = records.some((chunks) => chunks.join('') === doc.verifyToken);
    if (!found) throw new BadRequestException('Bản ghi TXT chưa đúng giá trị yêu cầu');

    doc.status = 'active';
    doc.verifiedAt = new Date();
    return doc.save();
  }

  async removeMine(user: AuthUser, id: string) {
    const doc = await this.model.findOne({ _id: id, kind: 'custom' });
    if (!doc) throw new NotFoundException('Không tìm thấy tên miền');
    if (user.role !== Role.Admin && doc.ownerId !== user.id) {
      throw new ForbiddenException('Không có quyền xóa tên miền này');
    }
    if (doc.cfZoneId) await this.cf.deleteZone(doc.cfZoneId);
    await doc.deleteOne();
    return { ok: true };
  }

  // ---------- Quản lý tên miền riêng của mọi người dùng (admin) ----------

  /** Tất cả tên miền riêng kèm chủ sở hữu và số link đang dùng. */
  async listCustomAdmin(): Promise<Record<string, unknown>[]> {
    const rows = await this.model.find({ kind: 'custom' }).sort({ createdAt: -1 });
    const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter(Boolean))].map((id) => new Types.ObjectId(id));
    const owners = ownerIds.length
      ? await this.model.db
          .collection('users')
          .find({ _id: { $in: ownerIds } }, { projection: { username: 1, fullName: 1 } })
          .toArray()
      : [];
    const byId = new Map(owners.map((o) => [String(o._id), o]));
    const links = this.model.db.collection('links');
    return Promise.all(
      rows.map(async (r) => {
        const o = byId.get(r.ownerId);
        return {
          ...r.toJSON(),
          owner: o ? { username: o.username as string, fullName: (o.fullName as string) ?? '' } : null,
          linkCount: await links.countDocuments({ domain: r.host }),
        };
      }),
    );
  }

  private async customOrThrow(id: string) {
    const doc = await this.model.findOne({ _id: id, kind: 'custom' });
    if (!doc) throw new NotFoundException('Không tìm thấy tên miền');
    return doc;
  }

  /** Admin bật/tắt tên miền riêng của người dùng. Chỉ bật lại được tên miền đã xác minh. */
  async setCustomActive(id: string, isActive: boolean) {
    const doc = await this.customOrThrow(id);
    if (isActive) {
      if (!doc.verifiedAt) throw new BadRequestException('Tên miền chưa xác minh, hãy bấm Xác minh trước');
      doc.status = 'active';
    } else {
      doc.status = 'disabled';
    }
    return doc.save();
  }

  /** Admin xóa tên miền riêng của người dùng (kèm zone Cloudflare nếu có). */
  async removeCustomAdmin(id: string) {
    const doc = await this.customOrThrow(id);
    if (doc.cfZoneId) await this.cf.deleteZone(doc.cfZoneId);
    await doc.deleteOne();
    return { ok: true };
  }

  /** Mọi tên miền đang có trong hệ thống (hệ thống + riêng), dùng để chặn rút gọn link trỏ lại chính nó. */
  async allHosts(): Promise<string[]> {
    const rows = await this.model.find({}, { host: 1 }).lean();
    return rows.map((r) => r.host);
  }

  // ---------- Dùng khi tạo link ----------

  /**
   * Các domain người dùng được dùng để tạo link:
   * system = domain hệ thống đang bật mà gói cho phép (danh sách gói trống = tất cả),
   * custom = domain riêng đã xác minh (chỉ khi gói còn cho phép domain riêng).
   */
  async available(user: AuthUser) {
    const { plan } = await this.plans.planFor(user.id);
    const isAdmin = user.role === Role.Admin;
    const system = (await this.model
      .find({ kind: 'system', status: 'active' })
      .sort({ isDefault: -1, host: 1 }))
      .filter((d) => isAdmin || !plan.systemDomains?.length || plan.systemDomains.includes(d.host));
    const customAllowed = isAdmin || (plan.maxCustomDomains ?? 0) > 0;
    const custom = customAllowed
      ? await this.model.find({ kind: 'custom', ownerId: user.id, status: 'active' })
      : [];
    return { system, custom };
  }

  /**
   * Chọn domain cho link mới: nếu người dùng chọn thì phải nằm trong `available`; nếu không chọn thì
   * lấy domain hệ thống mặc định (hoặc cái đầu tiên được phép). Trả '' khi chưa có domain nào cấu hình
   * (khi đó link dùng domain của trang đang truy cập).
   */
  async pickForNewLink(user: AuthUser, requested?: string): Promise<string> {
    const { system, custom } = await this.available(user);
    if (requested) {
      const host = normalizeHost(requested);
      if ([...system, ...custom].some((d) => d.host === host)) return host;
      throw new BadRequestException('Tên miền này không khả dụng với gói hiện tại của bạn');
    }
    return system[0]?.host ?? '';
  }
}
