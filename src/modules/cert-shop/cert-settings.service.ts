import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { decryptSecret, encryptSecret } from '../../common/crypto';
import { UpdateCertSettingsDto } from './dto/cert-shop.dto';
import { CertSetting, CertSettingDocument } from './schemas/cert-setting.schema';

export interface ShopSettings {
  siteUrl: string;
  bankId: string;
  bankAccountNo: string;
  bankAccountName: string;
  priceMarkup: number;
  priceRoundTo: number;
  planFeatures: string[];
  appFile: string;
  appName: string;
  appVersion: string;
  appBundleId: string;
  appMinOs: string;
  chungchiBaseUrl: string;
  chungchiApiKey: string;
  webhookSecret: string;
}

const CACHE_MS = 15_000;

export const DEFAULT_PLAN_FEATURES = [
  'Phù hợp mọi thiết bị, mọi OS.',
  'Hỗ trợ App group, thông báo đẩy, VPN/network, Siri...',
  'Cài và nhân bản app không giới hạn.',
];

/**
 * Đọc cấu hình từ DB, trường nào chưa đặt thì lấy từ env, rồi mặc định.
 * Khóa bí mật được mã hóa khi lưu và chỉ giải mã trong bộ nhớ khi dùng.
 */
@Injectable()
export class CertSettingsService {
  private cache?: { at: number; value: ShopSettings };

  constructor(
    @InjectModel(CertSetting.name) private readonly model: Model<CertSettingDocument>,
    private readonly config: ConfigService,
  ) {}

  private get secret() {
    return this.config.getOrThrow<string>('COOKIE_SECRET');
  }

  async get(): Promise<ShopSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const d = await this.model.findOne({ key: 'main' });
    const env = <T>(k: string, def: T) => this.config.get<T>(k, def);
    const dec = (v?: string) => {
      if (!v) return '';
      try {
        return decryptSecret(v, this.secret);
      } catch {
        return ''; // COOKIE_SECRET đổi thì khóa cũ không giải mã được: coi như chưa đặt
      }
    };
    const value: ShopSettings = {
      siteUrl: (d?.siteUrl || env('CERT_SHOP_URL', 'http://localhost:3000')).replace(/\/$/, ''),
      bankId: d?.bankId || env('CERT_BANK_ID', 'ACB'),
      bankAccountNo: d?.bankAccountNo || env('CERT_BANK_ACCOUNT_NO', ''),
      bankAccountName: d?.bankAccountName || env('CERT_BANK_ACCOUNT_NAME', ''),
      priceMarkup: d?.priceMarkup ?? Number(env('CERT_PRICE_MARKUP', 1.3)),
      priceRoundTo: d?.priceRoundTo ?? Number(env('CERT_PRICE_ROUND_TO', 1000)),
      planFeatures: d?.planFeatures?.length ? d.planFeatures : DEFAULT_PLAN_FEATURES,
      appFile: d?.appFile ?? '',
      appName: d?.appName || 'Metus Browser',
      appVersion: d?.appVersion ?? '',
      appBundleId: d?.appBundleId ?? '',
      appMinOs: d?.appMinOs ?? '',
      chungchiBaseUrl: (d?.chungchiBaseUrl || env('CHUNGCHI_BASE_URL', 'https://chungchi.store')).replace(/\/$/, ''),
      chungchiApiKey: dec(d?.chungchiApiKeyEnc) || env('CHUNGCHI_API_KEY', ''),
      webhookSecret: dec(d?.webhookSecretEnc) || env('CHUNGCHI_WEBHOOK_SECRET', ''),
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Dạng trả cho admin: không lộ khóa, chỉ cho biết đã đặt hay chưa. */
  async view() {
    const s = await this.get();
    return {
      siteUrl: s.siteUrl,
      bankId: s.bankId,
      bankAccountNo: s.bankAccountNo,
      bankAccountName: s.bankAccountName,
      priceMarkup: s.priceMarkup,
      priceRoundTo: s.priceRoundTo,
      planFeatures: s.planFeatures,
      chungchiBaseUrl: s.chungchiBaseUrl,
      hasApiKey: Boolean(s.chungchiApiKey),
      apiKeyHint: s.chungchiApiKey ? `…${s.chungchiApiKey.slice(-4)}` : '',
      hasWebhookSecret: Boolean(s.webhookSecret),
    };
  }

  /** Ghi thông tin app đã tải lên (gọi sau khi file đã nằm đúng chỗ). */
  async saveApp(app: { file: string; name: string; version: string; bundleId: string; minOs: string }) {
    await this.model.updateOne(
      { key: 'main' },
      {
        $set: {
          appFile: app.file,
          appName: app.name,
          appVersion: app.version,
          appBundleId: app.bundleId,
          appMinOs: app.minOs,
        },
        $setOnInsert: { key: 'main' },
      },
      { upsert: true },
    );
    this.cache = undefined;
  }

  async clearApp() {
    await this.model.updateOne(
      { key: 'main' },
      { $unset: { appFile: '', appName: '', appVersion: '', appBundleId: '', appMinOs: '' } },
    );
    this.cache = undefined;
  }

  async update(dto: UpdateCertSettingsDto) {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    const plain = [
      'siteUrl',
      'bankId',
      'bankAccountNo',
      'bankAccountName',
      'priceMarkup',
      'priceRoundTo',
      'chungchiBaseUrl',
    ] as const;
    for (const k of plain) if (dto[k] !== undefined) set[k] = dto[k];
    if (dto.planFeatures !== undefined) {
      const lines = dto.planFeatures.map((l) => l.trim()).filter(Boolean);
      // Danh sách rỗng = quay về mặc định
      if (lines.length) set.planFeatures = lines;
      else unset.planFeatures = '';
    }
    // Khóa bí mật: chuỗi rỗng = giữ nguyên; chỉ ghi khi admin nhập giá trị mới.
    if (dto.chungchiApiKey) set.chungchiApiKeyEnc = encryptSecret(dto.chungchiApiKey, this.secret);
    if (dto.webhookSecret) set.webhookSecretEnc = encryptSecret(dto.webhookSecret, this.secret);

    await this.model.updateOne(
      { key: 'main' },
      { $set: set, ...(Object.keys(unset).length && { $unset: unset }), $setOnInsert: { key: 'main' } },
      { upsert: true },
    );
    this.cache = undefined;
    return this.view();
  }
}
