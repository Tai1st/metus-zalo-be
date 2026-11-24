/**
 * Link Shopee: nhận link rút gọn (s.shopee.vn, shp.ee, vn.shp.ee) hoặc link sản phẩm shopee.vn, trả về URL web đầy đủ,
 * deeplink mở thẳng app Shopee (shopeevn://) và (với link rút gọn) tiêu đề + ảnh xem trước.
 * Chỉ gọi tới các tên miền Shopee trong danh sách cho phép, không đi theo chuyển hướng ra ngoài.
 */

const SHORT_HOSTS = new Set(['s.shopee.vn', 'shp.ee', 'vn.shp.ee']);
const WEB_HOSTS = new Set(['shopee.vn', 'www.shopee.vn']);

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
// Shopee trả trang xem trước (og:title, og:image) cho bot kiểu Telegram; bot Facebook thì bị chặn.
const PREVIEW_UA = 'TelegramBot (like TwitterBot)';

const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const isShopeeShortUrl = (u: string) => SHORT_HOSTS.has(host(u));
export const isShopeeWebUrl = (u: string) => WEB_HOSTS.has(host(u));
export const isShopeeUrl = (u: string) => isShopeeShortUrl(u) || isShopeeWebUrl(u);

/** Deeplink mở thẳng app Shopee tới trang web đã cho (định dạng lấy từ trang mở app của chính Shopee). */
export function buildShopeeDeeplink(webUrl: string): string {
  return `shopeevn://reactPath?navigate_url=${encodeURIComponent(webUrl)}&path=${encodeURIComponent('shopee/TRANSFER_PAGE')}&tab=buy&use_deeplink=1&version=1`;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'");

function og(html: string, prop: string): string {
  const m =
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html) ??
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i').exec(html);
  return m ? decodeEntities(m[1]).trim() : '';
}

async function get(url: string, ua: string, manual: boolean) {
  return fetch(url, {
    redirect: manual ? 'manual' : 'follow',
    headers: { 'user-agent': ua, 'accept-language': 'vi-VN,vi;q=0.9', accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(10_000),
  });
}

export type ShopeeTarget = { webUrl: string; appLink: string; title: string; image: string };

/** Đọc link Shopee. Ném Error (thông báo tiếng Việt) khi link không hợp lệ hoặc không đọc được. */
export async function resolveShopee(input: string): Promise<ShopeeTarget> {
  if (!isShopeeUrl(input)) {
    throw new Error('Chỉ nhận link Shopee (s.shopee.vn, shp.ee, vn.shp.ee hoặc shopee.vn)');
  }

  let webUrl = input;
  let title = '';
  let image = '';

  if (isShopeeShortUrl(input)) {
    // 1) Trang xem trước dành cho bot: tiêu đề và ảnh sản phẩm (lỗi thì bỏ qua, người dùng vẫn nhập tay được tiêu đề).
    try {
      const res = await get(input, PREVIEW_UA, true);
      if (res.status === 200) {
        const html = (await res.text()).slice(0, 200_000);
        title = og(html, 'og:title');
        const img = og(html, 'og:image');
        if (/^https:\/\//i.test(img)) image = img;
      }
    } catch {
      /* bỏ qua */
    }
    // 2) Đích thật: đi theo chuyển hướng bằng UA máy tính, chỉ chấp nhận các bước còn trong tên miền Shopee.
    let cur = input;
    let found = '';
    for (let i = 0; i < 4; i++) {
      let res: Response;
      try {
        res = await get(cur, DESKTOP_UA, true);
      } catch {
        throw new Error('Không đọc được link Shopee, thử lại sau');
      }
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, cur).toString();
        if (!isShopeeUrl(next)) throw new Error('Link rút gọn trỏ ra ngoài Shopee');
        if (isShopeeWebUrl(next)) {
          found = next;
          break;
        }
        cur = next;
        continue;
      }
      break;
    }
    if (!found) throw new Error('Không tìm được trang sản phẩm từ link Shopee này');
    webUrl = found;
  }

  return { webUrl, appLink: buildShopeeDeeplink(webUrl), title: title.slice(0, 200), image };
}
