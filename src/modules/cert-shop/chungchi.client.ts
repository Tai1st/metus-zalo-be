import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CertSettingsService } from './cert-settings.service';

export interface ProviderPlan {
  id: number | string;
  title: string;
  amount: number;
  currency: string;
  receive_time?: string;
  validity?: string;
  warranty?: string;
}

export interface ProviderOrder {
  order_code: string;
  plan_id: number | string;
  status: string; // pending | completed (failed/cancelled chỉ qua webhook)
  download_url?: string;
  udid?: string;
  created_at?: string;
}

/**
 * Lỗi từ nhà cung cấp. Dùng 424 thay vì 502: Cloudflare thay mọi 502 từ origin bằng trang chữ
 * "error code: 502" nên giao diện không đọc được thông báo lỗi.
 */
export class ProviderError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(
      code === 'INSUFFICIENT_BALANCE'
        ? 'Hệ thống tạm hết số dư để xử lý đơn, vui lòng liên hệ admin'
        : message,
      HttpStatus.FAILED_DEPENDENCY,
    );
  }
}

/** Client gọi chungchi.store. Response thành công được bọc trong { data: ... }. */
@Injectable()
export class ChungchiClient {
  constructor(private readonly settings: CertSettingsService) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { chungchiApiKey: key, chungchiBaseUrl: base } = await this.settings.get();
    if (!key) throw new ProviderError('NO_KEY', 'Chưa cấu hình API key nhà cung cấp');
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // Cloudflare / tường lửa có thể trả HTML (403/429)
      throw new ProviderError('NON_JSON', `Nhà cung cấp trả về lỗi (${res.status})`);
    }
    if (!res.ok) {
      const err = json.error ?? json;
      throw new ProviderError(err.code || 'ERROR', err.message || `HTTP ${res.status}`);
    }
    return (json.data ?? json) as T;
  }

  async plans(): Promise<ProviderPlan[]> {
    return (await this.call<{ plans: ProviderPlan[] }>('/api/v1/plans')).plans;
  }

  balance() {
    return this.call<{ wallet: number; currency: string }>('/api/v1/balance');
  }

  async createOrder(input: {
    plan_id: number | string;
    udid: string;
    device: 'iphone' | 'ipad';
    p12_password: string;
  }): Promise<ProviderOrder> {
    return (
      await this.call<{ order: ProviderOrder }>('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).order;
  }

  async getOrder(code: string): Promise<ProviderOrder> {
    return (
      await this.call<{ order: ProviderOrder }>(
        `/api/v1/orders/${encodeURIComponent(code)}`,
      )
    ).order;
  }

  /** Một trang đơn của một UDID bên nhà cung cấp (API có phân trang bằng cursor, tối đa limit=50/trang). */
  async ordersByUdidPage(udid: string, cursor?: number, limit = 50): Promise<{ orders: ProviderOrder[]; nextCursor: number | null }> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) qs.set('cursor', String(cursor));
    const r = await this.call<{ orders: ProviderOrder[]; next_cursor: number | null }>(
      `/api/v1/devices/${encodeURIComponent(udid)}/orders?${qs}`,
    );
    return { orders: r.orders, nextCursor: r.next_cursor };
  }

  /**
   * Toàn bộ đơn của một UDID — dùng để tránh tạo trùng khi gửi lại đơn sau lỗi mơ hồ (xem fulfill()).
   * Tự lặp qua cursor cho tới hết (không giả định trang đầu đã đủ), chặn trần số trang để không gọi
   * vô hạn nếu nhà cung cấp trả next_cursor sai/lặp.
   */
  async ordersByUdid(udid: string, maxPages = 20): Promise<ProviderOrder[]> {
    const all: ProviderOrder[] = [];
    let cursor: number | undefined;
    for (let i = 0; i < maxPages; i++) {
      const { orders, nextCursor } = await this.ordersByUdidPage(udid, cursor);
      all.push(...orders);
      if (nextCursor === null || nextCursor === undefined) break;
      cursor = nextCursor;
    }
    return all;
  }

  // Đường dẫn "chekcert" viết sai đúng như tài liệu nhà cung cấp.
  checkCert(order_code: string) {
    return this.call<{ certificate: Record<string, unknown> }>('/api/v1/chekcert', {
      method: 'POST',
      body: JSON.stringify({ order_code }),
    });
  }

  warranty(order_code: string) {
    return this.call<{ status: string; message: string }>('/api/v1/warranty', {
      method: 'POST',
      body: JSON.stringify({ order_code }),
    });
  }

  /**
   * Đăng ký (hoặc thay) URL nhận webhook. Secret chỉ được nhà cung cấp trả về đúng một lần trong
   * response này — không xem lại được qua dashboard, nên phải lưu ngay lập tức khi gọi xong.
   */
  registerWebhook(url: string) {
    return this.call<{ url: string; secret: string }>('/api/v1/webhook', {
      method: 'POST',
      body: JSON.stringify({ action: 'set', url }),
    });
  }

  /** Tải file zip; download_url có thể cần Bearer nên chỉ gắn khi cùng host. */
  async download(url: string): Promise<Response> {
    const { chungchiApiKey: key, chungchiBaseUrl: base } = await this.settings.get();
    const full = url.startsWith('http') ? url : `${base}${url}`;
    const same = new URL(full).origin === new URL(base).origin;
    return fetch(full, {
      headers: same ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(60_000),
    });
  }
}
