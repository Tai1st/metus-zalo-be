import { randomBytes } from 'node:crypto';

/** Chỉ cho phép link thuộc tiktok.com để không biến thành open-redirect / SSRF. */
const ALLOWED_HOST = /(^|\.)tiktok\.com$/i;
const SHORT_HOST = /^(vt|vm)\.tiktok\.com$/i;
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/21F90';

export type LinkKind = 'product' | 'campaign';

export type ParsedTarget = {
  kind: LinkKind;
  appLink: string;
  title: string;
  image: string;
  productId?: string;
  campaignId?: string;
};

/** Địa chỉ nội bộ / không công khai: không cho làm đích của link rút gọn thường (tránh lợi dụng truy cập mạng nội bộ). */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  // IPv6: loopback, unique-local (fc00::/7), link-local (fe80::/10), IPv4-mapped
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  // Số thập phân/hex/octal kiểu "2130706433", "0x7f000001" cũng là địa chỉ IP
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return true;
  return !h.includes('.'); // tên không có dấu chấm (vd "intranet") không phải tên miền công khai
}

/**
 * Chuẩn hóa và kiểm tra đích của link rút gọn thường: chỉ http/https, không có user:pass@, không là địa chỉ nội bộ,
 * không trỏ về chính tên miền rút gọn của hệ thống (selfHosts). Ném Error với thông báo tiếng Việt.
 */
export function validateNormalUrl(input: string, selfHosts: string[]): string {
  let x: URL;
  try {
    x = new URL(input.trim());
  } catch {
    throw new Error('Đường dẫn không hợp lệ');
  }
  if (x.protocol !== 'http:' && x.protocol !== 'https:') throw new Error('Chỉ nhận đường dẫn http hoặc https');
  if (x.username || x.password) throw new Error('Đường dẫn không được chứa tên đăng nhập/mật khẩu');
  if (x.href.length > 2048) throw new Error('Đường dẫn quá dài (tối đa 2048 ký tự)');
  if (isPrivateHost(x.hostname)) throw new Error('Không thể rút gọn địa chỉ nội bộ hoặc không công khai');
  const host = x.hostname.toLowerCase();
  if (selfHosts.some((h) => h && (host === h || host.endsWith('.' + h)))) {
    throw new Error('Không thể rút gọn link đã được rút gọn bởi hệ thống này');
  }
  return x.href;
}

/** Ảnh xem trước: chỉ https, không có user:pass@, không là địa chỉ nội bộ (ảnh do trình duyệt/trình quét tải, không phải server). */
export function validateImageUrl(input: string): string {
  let x: URL;
  try {
    x = new URL(input.trim());
  } catch {
    throw new Error('Đường dẫn ảnh không hợp lệ');
  }
  if (x.protocol !== 'https:') throw new Error('Ảnh xem trước phải là đường dẫn https');
  if (x.username || x.password) throw new Error('Đường dẫn ảnh không được chứa tên đăng nhập/mật khẩu');
  if (x.href.length > 2048) throw new Error('Đường dẫn ảnh quá dài');
  if (isPrivateHost(x.hostname)) throw new Error('Đường dẫn ảnh không được là địa chỉ nội bộ');
  return x.href;
}

export function isTikTokUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && ALLOWED_HOST.test(x.hostname);
  } catch {
    return false;
  }
}

/** vt/vm.tiktok.com -> theo từng lần 301 (chỉ trong tiktok.com) tới URL đích. */
export async function resolveShort(u: string): Promise<string> {
  let cur = u;
  for (let i = 0; i < 5; i++) {
    if (!SHORT_HOST.test(new URL(cur).hostname)) return cur;
    const r = await fetch(cur, {
      redirect: 'manual',
      headers: { 'user-agent': MOBILE_UA },
      signal: AbortSignal.timeout(8000),
    });
    const loc = r.headers.get('location');
    if (!loc) throw new Error('Không đọc được link rút gọn');
    cur = new URL(loc, cur).toString();
    if (!isTikTokUrl(cur)) throw new Error('Link rút gọn trỏ ra ngoài TikTok');
  }
  return cur;
}

/** Ảnh xem trước lấy từ chính trang tiktok.com (host đã được kiểm tra). */
async function fetchPreview(webUrl: string) {
  try {
    const r = await fetch(webUrl, {
      headers: { 'user-agent': MOBILE_UA },
      signal: AbortSignal.timeout(8000),
    });
    const h = await r.text();
    const og = (p: string) => {
      const m = h.match(
        new RegExp(`<meta[^>]+property="${p}"[^>]*content="([^"]*)"`),
      );
      return m ? m[1].replace(/&amp;/g, '&') : '';
    };
    return { title: og('og:title'), image: og('og:image') };
  } catch {
    return { title: '', image: '' };
  }
}

function buildProductAppLink(webUrl: string, productId: string): string {
  const q = new URLSearchParams({
    biz_type: '0',
    gd_label:
      'click_wap_p_product_detail_t_launch_pop_up_s_product_detail_e__f_product_detail_fp__fps_affiliate_links_rf_product_detail',
    need_mall: '1',
    needlaunchlog: '1',
    page_name: 'reflow_pdp',
    params_url: webUrl,
    refer: 'web',
    requestParams: JSON.stringify({ product_id: [productId] }),
    trackParams: '{}',
    is_commerce: '1',
  });
  // Giống deeplink gốc của TikTok: lặp lại các tham số của link web ở cấp ngoài.
  for (const [k, v] of new URL(webUrl).searchParams) q.append(k, v);
  return 'snssdk1180://ec/pdp?' + q.toString();
}

function buildCampaignAppLink(webUrl: string): string {
  const q = new URLSearchParams(new URL(webUrl).search);
  q.set('caravel_open_app', 'facebook');
  q.set('caravel_open_method', 'deeplink');
  const inner = 'https://oec-api.tiktokv.com/caravel/campaign?' + q.toString();
  return 'snssdk1180://webview?' + new URLSearchParams({ url: inner }).toString();
}

/** iOS: universal link (onelink) — Facebook không cảnh báo, khác với scheme tùy biến. */
export function buildOnelink(appLink: string): string {
  return (
    'https://snssdk1180.onelink.me/BAuo?domain_source=tiktok&af_dp=' +
    encodeURIComponent(appLink) +
    '&af_force_deeplink=true&refer=web&action=openapp'
  );
}

/** Phân tích URL web TikTok đã giải mã: sản phẩm (/view/product/<id>) hoặc chiến dịch (/caravel/campaign). */
export async function parseTarget(webUrl: string): Promise<ParsedTarget | null> {
  const x = new URL(webUrl);

  const p = x.pathname.match(/\/view\/product\/(\d+)/);
  if (p) {
    let title = '';
    let image = '';
    try {
      const og = JSON.parse(x.searchParams.get('og_info') || '{}') as {
        title?: string;
        image?: string;
      };
      title = og.title || '';
      image = og.image || '';
    } catch {
      /* og_info không bắt buộc */
    }
    return {
      kind: 'product',
      productId: p[1],
      appLink: buildProductAppLink(webUrl, p[1]),
      title,
      image,
    };
  }

  if (/^\/caravel\/campaign\/?$/.test(x.pathname)) {
    const campaignId = x.searchParams.get('campaign_id');
    if (!campaignId) return null;
    const pv = await fetchPreview(webUrl);
    return {
      kind: 'campaign',
      campaignId,
      appLink: buildCampaignAppLink(webUrl),
      title: '',
      image: pv.image,
    };
  }

  return null;
}

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export function newCode(): string {
  let s = '';
  for (const v of randomBytes(8)) s += CODE_ALPHABET[v % CODE_ALPHABET.length];
  return s;
}
