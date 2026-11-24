/** Phân loại lượt bấm từ User-Agent và Referer: thiết bị, hệ điều hành, nguồn truy cập. */

export type ClickInfo = { device: string; os: string; source: string; refererHost: string };

const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

export function parseClick(ua = '', referer = ''): ClickInfo {
  let device = 'other';
  let os = 'Other';
  if (/iPhone|iPod/i.test(ua)) (device = 'iphone'), (os = 'iOS');
  else if (/iPad/i.test(ua)) (device = 'ipad'), (os = 'iOS');
  else if (/Android/i.test(ua)) (device = 'android'), (os = 'Android');
  else if (/Windows/i.test(ua)) (device = 'desktop'), (os = 'Windows');
  else if (/Macintosh|Mac OS X/i.test(ua)) (device = 'desktop'), (os = 'macOS');
  else if (/X11|Linux|CrOS/i.test(ua)) (device = 'desktop'), (os = 'Linux');

  const refererHost = host(referer);
  let source = 'direct';
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger/i.test(ua) || /(^|\.)(facebook\.com|fb\.com|messenger\.com)$/.test(refererHost)) source = 'facebook';
  else if (/Zalo/i.test(ua) || /(^|\.)zalo\.me$/.test(refererHost)) source = 'zalo';
  else if (/Instagram/i.test(ua) || /(^|\.)instagram\.com$/.test(refererHost)) source = 'instagram';
  else if (/TikTok|musical_ly|Bytedance/i.test(ua) || /(^|\.)tiktok\.com$/.test(refererHost)) source = 'tiktok';
  else if (/Telegram/i.test(ua) || /(^|\.)(t\.me|telegram\.org)$/.test(refererHost)) source = 'telegram';
  else if (/(^|\.)google\./.test(refererHost)) source = 'google';
  else if (/(^|\.)(youtube\.com|youtu\.be)$/.test(refererHost)) source = 'youtube';
  else if (refererHost) source = 'other';
  return { device, os, source, refererHost };
}
