import { createHash } from 'node:crypto';
import type { Agent } from 'node:http';
import { Injectable } from '@nestjs/common';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { API, Zalo } from 'zca-js';

export type ZaloProxy = {
  protocol: 'http' | 'socks5';
  host: string;
  port: number;
  username: string;
  password: string;
};

export type ZaloSession = {
  zaloId: string;
  /** JSON string: tough-cookie jar đã serialize. */
  cookies: string;
  imei: string;
  userAgent: string;
  proxy?: ZaloProxy | null;
};

const TTL_MS = 10 * 60 * 1000;

function proxyAgent(p: ZaloProxy): Agent {
  const auth = p.username
    ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
    : '';
  const scheme = p.protocol === 'socks5' ? 'socks5' : 'http';
  const url = `${scheme}://${auth}${p.host}:${p.port}`;
  return (p.protocol === 'socks5'
    ? new SocksProxyAgent(url)
    : new HttpsProxyAgent(url)) as unknown as Agent;
}

/** Giữ phiên zca-js theo tài khoản để không đăng nhập lại mỗi lần gọi. */
@Injectable()
export class ZaloSessionService {
  private cache = new Map<
    string,
    { key: string; api: Promise<API>; at: number }
  >();

  getApi(s: ZaloSession): Promise<API> {
    const key = createHash('sha256')
      .update(s.cookies + s.imei + JSON.stringify(s.proxy ?? null))
      .digest('hex');
    const hit = this.cache.get(s.zaloId);
    if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) {
      hit.at = Date.now();
      return hit.api;
    }
    const zalo = new Zalo({
      ...(s.proxy ? { agent: proxyAgent(s.proxy) } : {}),
    });
    const api = zalo.login({
      cookie: JSON.parse(s.cookies),
      imei: s.imei,
      userAgent: s.userAgent,
    });
    this.cache.set(s.zaloId, { key, api, at: Date.now() });
    api.catch(() => this.cache.delete(s.zaloId));
    return api;
  }
}
