import * as crypto from 'node:crypto';

/**
 * AES-256-GCM at rest for Zalo cookies, mirroring the Next app's own
 * `src/server/security/crypto.ts` so a migrated cookie decrypts the same way
 * — but keyed by this service's own `COOKIE_SECRET`, not Next's key. Cookies
 * only ever leave this process over the INTERNAL_KEY-guarded /internal/*
 * routes, never to the browser.
 */
let cachedKey: Buffer | null = null;

function key(secret: string): Buffer {
  if (!cachedKey)
    cachedKey = crypto.createHash('sha256').update(secret).digest();
  return cachedKey;
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string, secret: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    'utf8',
  );
}
