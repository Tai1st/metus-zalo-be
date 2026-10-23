import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Profile Service payload: iPhone POST UDID về enrollUrl khi người dùng bấm Install. */
export function buildMobileConfig(enrollUrl: string, org = 'Metus'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key>
    <string>${esc(enrollUrl)}</string>
    <key>DeviceAttributes</key>
    <array>
      <string>UDID</string>
      <string>PRODUCT</string>
      <string>VERSION</string>
    </array>
  </dict>
  <key>PayloadOrganization</key><string>${esc(org)}</string>
  <key>PayloadDisplayName</key><string>Lấy UDID thiết bị</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadUUID</key><string>${randomUUID().toUpperCase()}</string>
  <key>PayloadIdentifier</key><string>com.metus.udid</string>
  <key>PayloadDescription</key><string>Cài hồ sơ này để xác định UDID thiết bị của bạn</string>
  <key>PayloadType</key><string>Profile Service</string>
</dict>
</plist>`;
}

/** Body iPhone gửi về là CMS đã ký (binary) chứa plist XML ở giữa; cắt phần XML ra rồi regex. */
export function parseDevicePlist(body: Buffer) {
  const text = body.toString('latin1');
  const start = text.indexOf('<?xml');
  const end = text.indexOf('</plist>');
  if (start < 0 || end < 0) return null;
  const xml = text.slice(start, end + 8);
  const get = (k: string) =>
    xml.match(new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`))?.[1];
  const udid = get('UDID');
  if (!udid || !/^[0-9A-Za-z-]{8,64}$/.test(udid)) return null;
  return { udid, product: get('PRODUCT') ?? '', version: get('VERSION') ?? '' };
}

export const deviceFromProduct = (product: string): 'iphone' | 'ipad' =>
  /^ipad/i.test(product) ? 'ipad' : 'iphone';

/**
 * Header X-Webhook-Signature dạng "v1=<hex HMAC-SHA256>" trên timestamp + raw body.
 * Tài liệu không ghi rõ dấu nối nên thử cả "ts.body" và "tsbody".
 */
export function verifyWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  header: string,
): boolean {
  if (!secret || !timestamp || !header) return false;
  const given = header
    .split(',')
    .map((s) => s.trim())
    .find((s) => s.startsWith('v1='))
    ?.slice(3);
  if (!given) return false;
  return [`${timestamp}.${rawBody}`, `${timestamp}${rawBody}`].some((p) => {
    const a = Buffer.from(createHmac('sha256', secret).update(p).digest('hex'));
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
