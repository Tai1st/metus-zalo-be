import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { CertSettingsService } from './cert-settings.service';

export interface BinanceDepositRecord {
  id: string;
  amount: string;
  coin: string;
  network: string;
  status: number; // 0 chờ, 1 thành công, 2 từ chối, 6 ghi có chưa rút được, 7 nạp sai, 8 chờ xác nhận
  address: string;
  addressTag: string;
  txId: string;
  insertTime: number;
  completeTime?: number;
  confirmTimes: string;
  travelRuleStatus?: number;
}

const BASE_URL = 'https://api.binance.com';
const RECV_WINDOW = 5000;

/**
 * Client ký request Binance Wallet API (USER_DATA endpoint). Chỉ dùng cho nạp (đọc): KHÔNG có
 * method rút/chuyển/giao dịch — đúng khuyến cáo trong đặc tả, API key chỉ cần bật quyền đọc.
 */
@Injectable()
export class BinanceClient {
  constructor(private readonly settings: CertSettingsService) {}

  private sign(query: string, apiSecret: string): string {
    return createHmac('sha256', apiSecret).update(query).digest('hex');
  }

  private async signedGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const { binanceApiKey: key, binanceApiSecret: secret } = await this.settings.get();
    if (!key || !secret) throw new Error('Chưa cấu hình Binance API key/secret');
    const qs = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      recvWindow: String(RECV_WINDOW),
      timestamp: String(Date.now()),
    });
    const query = qs.toString();
    const signature = this.sign(query, secret);
    const res = await fetch(`${BASE_URL}${path}?${query}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': key },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Binance trả về không phải JSON (HTTP ${res.status})`);
    }
    if (!res.ok) {
      const err = json as { msg?: string; code?: number };
      throw new Error(`Binance lỗi ${err.code ?? res.status}: ${err.msg ?? 'không rõ'}`);
    }
    return json as T;
  }

  /** Lịch sử nạp USDT, mới nhất trước. Dùng cho worker đối soát — không lọc status để theo dõi cả chuyển trạng thái. */
  depositHistory(opts: { startTime?: number; endTime?: number; offset?: number; limit?: number } = {}): Promise<BinanceDepositRecord[]> {
    return this.signedGet<BinanceDepositRecord[]>('/sapi/v1/capital/deposit/hisrec', {
      coin: 'USDT',
      offset: opts.offset ?? 0,
      limit: opts.limit ?? 1000,
      ...(opts.startTime && { startTime: opts.startTime }),
      ...(opts.endTime && { endTime: opts.endTime }),
    });
  }
}
