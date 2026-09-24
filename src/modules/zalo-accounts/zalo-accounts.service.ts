import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { decryptSecret, encryptSecret } from '../../common/crypto';
import { ZaloProxiesService, type ProxyLike } from './zalo-proxies.service';
import { AccountLabelsService } from './account-labels.service';
import { UpsertAccountDto } from './dto/upsert-account.dto';
import { ProfileUpdateDto } from './dto/profile-update.dto';
import {
  ZaloAccount,
  ZaloAccountDocument,
} from './schemas/zalo-account.schema';

export type AccountPublic = {
  zaloId: string;
  fullName: string;
  avatarUrl: string;
  phone: string;
  isBusiness: boolean;
  isActive: boolean;
  labelIds: number[];
  proxyId: number | null;
  createdAt: string;
  lastSeen: string | null;
};

export type AccountSession = {
  zaloId: string;
  cookies: string; // decrypted, plaintext JSON
  imei: string;
  userAgent: string;
  proxy: ProxyLike | null;
  phone: string;
};

@Injectable()
export class ZaloAccountsService {
  constructor(
    @InjectModel(ZaloAccount.name)
    private readonly model: Model<ZaloAccountDocument>,
    private readonly proxies: ZaloProxiesService,
    private readonly labels: AccountLabelsService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>('COOKIE_SECRET');
  }

  private toPublic(doc: ZaloAccountDocument): AccountPublic {
    return {
      zaloId: doc.zaloId,
      fullName: doc.fullName,
      avatarUrl: doc.avatarUrl,
      phone: doc.phone,
      isBusiness: doc.isBusiness,
      isActive: doc.isActive,
      labelIds: doc.labelIds,
      proxyId: doc.proxyId,
      createdAt: doc.createdAt,
      lastSeen: doc.lastSeen,
    };
  }

  async list(): Promise<AccountPublic[]> {
    const rows = await this.model.find().sort({ sortOrder: 1, createdAt: 1 });
    return rows.map((r) => this.toPublic(r));
  }

  async get(zaloId: string): Promise<AccountPublic> {
    const row = await this.model.findOne({ zaloId });
    if (!row) throw new NotFoundException('Không tìm thấy tài khoản');
    return this.toPublic(row);
  }

  /** Create or update, mirroring the old SQLite upsert (re-activates on link). */
  async upsert(dto: UpsertAccountDto): Promise<void> {
    const existing = await this.model.findOne({ zaloId: dto.zaloId });
    const now = new Date().toISOString();
    const cookiesEnc = encryptSecret(dto.cookies, this.secret());

    if (existing) {
      existing.fullName = dto.fullName ?? existing.fullName;
      existing.avatarUrl = dto.avatarUrl ?? existing.avatarUrl;
      existing.phone = dto.phone ?? existing.phone;
      existing.isBusiness = dto.isBusiness ?? existing.isBusiness;
      existing.imei = dto.imei;
      existing.userAgent = dto.userAgent;
      existing.cookiesEnc = cookiesEnc;
      existing.isActive = true;
      existing.lastSeen = now;
      await existing.save();
      return;
    }

    const maxOrder = await this.model
      .findOne()
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    await this.model.create({
      zaloId: dto.zaloId,
      fullName: dto.fullName ?? '',
      avatarUrl: dto.avatarUrl ?? '',
      phone: dto.phone ?? '',
      isBusiness: dto.isBusiness ?? false,
      imei: dto.imei,
      userAgent: dto.userAgent,
      cookiesEnc,
      isActive: true,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      proxyId: null,
      labelIds: [],
      createdAt: now,
      lastSeen: now,
    });
  }

  async remove(zaloId: string): Promise<void> {
    await this.model.deleteOne({ zaloId });
  }

  async touchLastSeen(zaloId: string): Promise<void> {
    await this.model.updateOne(
      { zaloId },
      { lastSeen: new Date().toISOString() },
    );
  }

  async updateProfile(zaloId: string, dto: ProfileUpdateDto): Promise<void> {
    const set: Record<string, unknown> = {};
    if (dto.fullName) set.fullName = dto.fullName;
    if (dto.phone) set.phone = dto.phone;
    if (dto.avatarUrl) set.avatarUrl = dto.avatarUrl;
    if (dto.isBusiness !== undefined) set.isBusiness = dto.isBusiness;
    if (Object.keys(set).length === 0) return;
    await this.model.updateOne({ zaloId }, set);
  }

  async setProxy(zaloId: string, proxyId: number | null): Promise<void> {
    if (proxyId !== null && !(await this.proxies.exists(proxyId))) {
      throw new NotFoundException('Không tìm thấy proxy');
    }
    const res = await this.model.updateOne({ zaloId }, { proxyId });
    if (res.matchedCount === 0)
      throw new NotFoundException('Không tìm thấy tài khoản');
  }

  async getLabelIds(zaloId: string): Promise<number[]> {
    const row = await this.model.findOne({ zaloId }).select('labelIds');
    return row?.labelIds ?? [];
  }

  async setLabelIds(zaloId: string, labelIds: number[]): Promise<void> {
    await this.model.updateOne(
      { zaloId },
      { labelIds: [...new Set(labelIds)] },
    );
  }

  /** Map of zaloId -> label ids, for rendering the accounts table in one query. */
  async labelIdsByAccount(): Promise<Record<string, number[]>> {
    const rows = await this.model.find().select('zaloId labelIds');
    const out: Record<string, number[]> = {};
    for (const r of rows) out[r.zaloId] = r.labelIds;
    return out;
  }

  /** Decrypted login session, resolved proxy included — for zca-js. */
  async getSession(zaloId: string): Promise<AccountSession> {
    const row = await this.model.findOne({ zaloId }).select('+cookiesEnc');
    if (!row) throw new NotFoundException('Không tìm thấy tài khoản');
    let proxy: ProxyLike | null = null;
    if (row.proxyId !== null) proxy = await this.proxies.getLike(row.proxyId);
    return {
      zaloId: row.zaloId,
      cookies: decryptSecret(row.cookiesEnc, this.secret()),
      imei: row.imei,
      userAgent: row.userAgent,
      proxy,
      phone: row.phone,
    };
  }

  /** Every active account's decrypted session, for reconnecting on boot. */
  async listActiveSessions(): Promise<AccountSession[]> {
    const rows = await this.model
      .find({ isActive: true })
      .select('+cookiesEnc');
    const out: AccountSession[] = [];
    for (const row of rows) {
      let proxy: ProxyLike | null = null;
      if (row.proxyId !== null) proxy = await this.proxies.getLike(row.proxyId);
      out.push({
        zaloId: row.zaloId,
        cookies: decryptSecret(row.cookiesEnc, this.secret()),
        imei: row.imei,
        userAgent: row.userAgent,
        proxy,
        phone: row.phone,
      });
    }
    return out;
  }
}
