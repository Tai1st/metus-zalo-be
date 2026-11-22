import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CfResponse<T> = {
  success: boolean;
  result: T;
  errors?: { code: number; message: string }[];
};

export type CfZone = { id: string; name: string; status: string; name_servers: string[] };

/**
 * Tên miền riêng của người dùng nằm trong zone Cloudflare thuộc tài khoản của hệ thống:
 * người dùng đổi nameserver về cặp Cloudflare được gán, Cloudflare tự lo DNS và HTTPS.
 * Chỉ bật khi có CF_API_TOKEN và CF_ACCOUNT_ID; thiếu thì dùng cách xác minh bản ghi TXT.
 */
@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly token: string;
  private readonly accountId: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('CF_API_TOKEN', '');
    this.accountId = config.get<string>('CF_ACCOUNT_ID', '');
  }

  get enabled() {
    return !!this.token && !!this.accountId;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new BadRequestException('Không kết nối được Cloudflare, thử lại sau');
    }
    const data = (await res.json().catch(() => null)) as CfResponse<T> | null;
    if (!res.ok || !data?.success) {
      const msg = data?.errors?.map((e) => `${e.message} (${e.code})`).join('; ') || `HTTP ${res.status}`;
      this.logger.warn(`Cloudflare ${method} ${path}: ${msg}`);
      throw new BadRequestException(`Cloudflare: ${msg}`);
    }
    return data.result;
  }

  createZone(name: string) {
    return this.call<CfZone>('POST', '/zones', {
      name,
      account: { id: this.accountId },
      type: 'full',
    });
  }

  getZone(id: string) {
    return this.call<CfZone>('GET', `/zones/${id}`);
  }

  /** Yêu cầu Cloudflare kiểm tra lại nameserver ngay (có giới hạn tần suất, lỗi thì bỏ qua). */
  async recheck(id: string) {
    await this.call('PUT', `/zones/${id}/activation_check`).catch(() => undefined);
  }

  async deleteZone(id: string) {
    await this.call('DELETE', `/zones/${id}`).catch((e) => {
      this.logger.warn(`Xóa zone ${id} lỗi: ${(e as Error).message}`);
    });
  }

  /** Tạo bản ghi CNAME gốc trỏ về hệ thống (có proxy) và đặt SSL Full. Gọi lại nhiều lần vẫn an toàn. */
  async setupZone(zoneId: string, host: string, target: string) {
    const existing = await this.call<{ id: string; type: string; name: string }[]>(
      'GET',
      `/zones/${zoneId}/dns_records?name=${encodeURIComponent(host)}`,
    );
    if (!existing.length) {
      await this.call('POST', `/zones/${zoneId}/dns_records`, {
        type: 'CNAME',
        name: host,
        content: target,
        proxied: true,
        ttl: 1,
      });
    }
    await this.call('PATCH', `/zones/${zoneId}/settings/ssl`, { value: 'full' }).catch(() => undefined);
    await this.call('PATCH', `/zones/${zoneId}/settings/always_use_https`, { value: 'on' }).catch(
      () => undefined,
    );
  }
}
