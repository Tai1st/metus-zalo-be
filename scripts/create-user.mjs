#!/usr/bin/env node
// Tạo người dùng thường kèm một gói cước đã kích hoạt (dùng cho demo / cấp tay sau khi khách thanh toán).
//
//   npm run create-user -- --username khach01 --plan personal --months 12 [--name "Tên"] [--generate-password]
//   npm run create-user -- --username khach01 --plan business --months 12 --addon staff-3
//
// Mật khẩu: nhập ẩn khi chạy, đọc từ stdin khi pipe, hoặc --generate-password để sinh ngẫu nhiên
// (in ra đúng một lần). Không lưu ở đâu khác.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
  const out = { flags: new Set() };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--generate-password') out.flags.add('generate');
    else if (a[i].startsWith('--')) out[a[i].slice(2)] = a[++i];
  }
  return out;
}

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (data += c));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
      return;
    }
    process.stdout.write(prompt);
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\u0003') {
          stdin.setRawMode(false);
          return reject(new Error('Đã huỷ'));
        }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

function validatePassword(pw) {
  if (pw.length < 12) return 'Mật khẩu tối thiểu 12 ký tự';
  if (Buffer.byteLength(pw) > 72) return 'Mật khẩu tối đa 72 byte';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Mật khẩu cần có cả chữ và số';
  return null;
}

function generatePassword() {
  for (;;) {
    const pw = crypto.randomBytes(12).toString('base64url'); // 16 ký tự
    if (!validatePassword(pw)) return pw;
  }
}

/** Cộng tháng theo lịch (31/1 + 1 tháng = 28/2). */
function addMonths(from, months) {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

const priceFor = (prices, m) => prices.find((p) => p.months === m)?.price;

async function main() {
  loadEnv();
  const opt = args();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI (xem .env.example)');

  const username = opt.username?.trim().toLowerCase();
  if (!username || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error('Cần --username hợp lệ (3–32 ký tự: a-z, 0-9, . _ -)');
  if (!opt.plan) throw new Error('Cần --plan (ví dụ personal hoặc business)');
  const months = Number(opt.months ?? 12);
  if (!Number.isInteger(months) || months < 1) throw new Error('--months không hợp lệ');

  let pw;
  let generated = false;
  if (opt.flags.has('generate')) {
    pw = generatePassword();
    generated = true;
  } else {
    pw = await askHidden('Mật khẩu (ẩn): ');
    const bad = validatePassword(pw);
    if (bad) throw new Error(bad);
    if (process.stdin.isTTY && (await askHidden('Nhập lại mật khẩu: ')) !== pw) {
      throw new Error('Hai lần nhập không khớp');
    }
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  try {
    const plan = await db.collection('plans').findOne({ code: opt.plan.toLowerCase(), isActive: true });
    if (!plan) throw new Error(`Không có gói "${opt.plan}" đang bán`);
    const planPrice = priceFor(plan.prices, months);
    if (planPrice === undefined) throw new Error(`Gói ${plan.name} không có chu kỳ ${months} tháng`);

    let addon = null;
    let addonDoc = null;
    if (opt.addon) {
      addonDoc = await db.collection('addons').findOne({ code: opt.addon.toLowerCase(), isActive: true });
      if (!addonDoc) throw new Error(`Không có gói mua thêm "${opt.addon}"`);
      if (addonDoc.requiresPlanCode !== plan.code) throw new Error(`Gói mua thêm này chỉ áp dụng cho gói ${addonDoc.requiresPlanCode}`);
      const ap = priceFor(addonDoc.prices, months);
      if (ap === undefined) throw new Error(`Gói mua thêm không có chu kỳ ${months} tháng`);
      addon = { code: addonDoc.code, name: addonDoc.name, seats: addonDoc.seats, price: ap };
    }

    if (await db.collection('users').findOne({ username })) throw new Error(`${username} đã tồn tại`);

    const now = new Date();
    const user = await db.collection('users').insertOne({
      username,
      passwordHash: await bcrypt.hash(pw, 12),
      fullName: opt.name?.trim() || username,
      role: 'user',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('subscriptions').insertOne({
      userId: user.insertedId,
      planId: plan._id,
      addonId: addonDoc?._id ?? null,
      snapshot: {
        planCode: plan.code,
        planName: plan.name,
        months,
        planPrice,
        addon,
        totalPrice: planPrice + (addon?.price ?? 0),
        currency: plan.currency,
        maxUsers: plan.maxUsers + (addon?.seats ?? 0),
      },
      status: 'active',
      startedAt: now,
      expiresAt: addMonths(now, months),
      createdAt: now,
      updatedAt: now,
    });

    console.log(`Đã tạo ${username} — gói ${plan.name}, ${months} tháng, hiệu lực đến ${addMonths(now, months).toLocaleDateString('vi-VN')}.`);
    if (generated) console.log(`Mật khẩu (chỉ hiện một lần): ${pw}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error('Lỗi: ' + e.message);
  process.exit(1);
});
