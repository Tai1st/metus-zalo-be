#!/usr/bin/env node
// One-time migration: metus-zalo's local SQLite (accounts, proxies, account
// labels, chat labels, chat label assignments) -> this service's MongoDB.
// Decrypts each account's cookie with the Next app's OWN key (its
// METUS_ZALO_SECRET, or data/.secret-key), then re-encrypts it with THIS
// service's COOKIE_SECRET before writing to Mongo. Old SQLite rows are left
// untouched — this only reads them.
//
//   npm run migrate:zalo-sqlite -- --sqlite ../metus-zalo/data/metus-zalo.db
//
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import mongoose from 'mongoose';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) out[a[i].slice(2)] = a[++i];
  return out;
}

// --- mirrors metus-zalo/src/server/security/crypto.ts decrypt() exactly ---
function loadNextKey(sqlitePath) {
  const fromEnv = process.env.NEXT_METUS_ZALO_SECRET; // pass via env if ever set on the Next side
  if (fromEnv) return crypto.createHash('sha256').update(fromEnv).digest();
  const keyFile = path.join(path.dirname(sqlitePath), '.secret-key');
  return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
}

function nextDecrypt(payload, key) {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// --- this service's own at-rest encryption (common/crypto.ts) ---
function beEncrypt(plain, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

async function main() {
  loadEnv();
  const opt = args();
  const sqlitePath = path.resolve(opt.sqlite ?? path.join(root, '..', 'metus-zalo', 'data', 'metus-zalo.db'));
  if (!fs.existsSync(sqlitePath)) throw new Error(`Không thấy file SQLite: ${sqlitePath}`);
  const mongoUri = process.env.MONGODB_URI;
  const cookieSecret = process.env.COOKIE_SECRET;
  if (!mongoUri) throw new Error('Thiếu MONGODB_URI');
  if (!cookieSecret) throw new Error('Thiếu COOKIE_SECRET');

  const nextKey = loadNextKey(sqlitePath);
  const sqlite = new Database(sqlitePath, { readonly: true });
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const stats = { accounts: 0, proxies: 0, accountLabels: 0, chatLabels: 0, assignments: 0 };

  // ---- proxies ----
  const proxyRows = sqlite.prepare('SELECT * FROM proxies ORDER BY id').all();
  for (const p of proxyRows) {
    await db.collection('zalo_proxies').updateOne(
      { seq: p.id },
      {
        $set: {
          seq: p.id,
          label: p.label ?? '',
          protocol: p.protocol === 'socks5' ? 'socks5' : 'http',
          host: p.host,
          port: p.port,
          username: p.username ?? '',
          password: p.password ?? '',
          isActive: p.is_active === 1,
          createdAt: p.created_at,
        },
      },
      { upsert: true },
    );
    stats.proxies++;
  }
  if (proxyRows.length) {
    await db.collection('counters').updateOne(
      { name: 'zalo_proxies' },
      { $max: { seq: Math.max(...proxyRows.map((p) => p.id)) } },
      { upsert: true },
    );
  }

  // ---- account labels ----
  const accountLabelRows = sqlite.prepare('SELECT * FROM account_labels ORDER BY id').all();
  for (const l of accountLabelRows) {
    await db.collection('account_labels').updateOne(
      { seq: l.id },
      { $set: { seq: l.id, name: l.name, color: l.color, createdAt: l.created_at } },
      { upsert: true },
    );
    stats.accountLabels++;
  }
  if (accountLabelRows.length) {
    await db.collection('counters').updateOne(
      { name: 'account_labels' },
      { $max: { seq: Math.max(...accountLabelRows.map((l) => l.id)) } },
      { upsert: true },
    );
  }

  // ---- chat labels ----
  const chatLabelRows = sqlite.prepare('SELECT * FROM chat_labels ORDER BY id').all();
  for (const l of chatLabelRows) {
    await db.collection('chat_labels').updateOne(
      { seq: l.id },
      { $set: { seq: l.id, name: l.name, color: l.color, createdAt: l.created_at } },
      { upsert: true },
    );
    stats.chatLabels++;
  }
  if (chatLabelRows.length) {
    await db.collection('counters').updateOne(
      { name: 'chat_labels' },
      { $max: { seq: Math.max(...chatLabelRows.map((l) => l.id)) } },
      { upsert: true },
    );
  }

  // ---- chat label assignments ----
  const assignRows = sqlite.prepare('SELECT * FROM chat_label_map').all();
  for (const a of assignRows) {
    await db.collection('chat_label_assignments').updateOne(
      { labelId: a.label_id, accountId: a.account_id, threadId: a.thread_id },
      { $setOnInsert: { labelId: a.label_id, accountId: a.account_id, threadId: a.thread_id } },
      { upsert: true },
    );
    stats.assignments++;
  }

  // ---- accounts (+ account_label_map -> embedded labelIds) ----
  const accountRows = sqlite.prepare('SELECT * FROM accounts ORDER BY sort_order, created_at').all();
  const labelMapStmt = sqlite.prepare('SELECT label_id FROM account_label_map WHERE zalo_id = ?');
  for (const a of accountRows) {
    let cookies;
    try {
      cookies = nextDecrypt(a.cookies, nextKey);
    } catch (e) {
      console.error(`Bỏ qua ${a.zalo_id}: không giải mã được cookie (${e.message})`);
      continue;
    }
    const labelIds = labelMapStmt.all(a.zalo_id).map((r) => r.label_id);
    await db.collection('zalo_accounts').updateOne(
      { zaloId: a.zalo_id },
      {
        $set: {
          zaloId: a.zalo_id,
          fullName: a.full_name ?? '',
          avatarUrl: a.avatar_url ?? '',
          phone: a.phone ?? '',
          isBusiness: a.is_business === 1,
          imei: a.imei,
          userAgent: a.user_agent,
          cookiesEnc: beEncrypt(cookies, cookieSecret),
          isActive: a.is_active === 1,
          sortOrder: a.sort_order ?? 0,
          proxyId: a.proxy_id ?? null,
          labelIds,
          createdAt: a.created_at,
          lastSeen: a.last_seen ?? null,
        },
      },
      { upsert: true },
    );
    stats.accounts++;
    console.log(`✓ ${a.zalo_id} (${a.full_name || 'chưa có tên'}) — nhãn: [${labelIds.join(', ')}]`);
  }

  sqlite.close();
  await mongoose.disconnect();
  console.log('\nĐã di chuyển:', stats);
}

main().catch((e) => {
  console.error('Lỗi di chuyển: ' + e.message);
  process.exit(1);
});
