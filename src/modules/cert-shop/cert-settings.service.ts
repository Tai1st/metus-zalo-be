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
  chungchiBaseUrl: string;
  chungchiApiKey: string;
  webhookSecret: string;
}

const CACHE_MS = 15_000;

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
      chungchiBaseUrl: s.chungchiBaseUrl,
      hasApiKey: Boolean(s.chungchiApiKey),
      apiKeyHint: s.chungchiApiKey ? `…${s.chungchiApiKey.slice(-4)}` : '',
      hasWebhookSecret: Boolean(s.webhookSecret),
    };
  }

  async update(dto: UpdateCertSettingsDto) {
    const set: Record<string, unknown> = {};
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
    // Khóa bí mật: chuỗi rỗng = giữ nguyên; chỉ ghi khi admin nhập giá trị mới.
    if (dto.chungchiApiKey) set.chungchiApiKeyEnc = encryptSecret(dto.chungchiApiKey, this.secret);
    if (dto.webhookSecret) set.webhookSecretEnc = encryptSecret(dto.webhookSecret, this.secret);

    await this.model.updateOne({ key: 'main' }, { $set: set, $setOnInsert: { key: 'main' } }, { upsert: true });
    this.cache = undefined;
    return this.view();
  }
}
