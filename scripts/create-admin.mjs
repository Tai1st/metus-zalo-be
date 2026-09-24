#!/usr/bin/env node
// Tạo / đặt lại mật khẩu tài khoản quản trị, hoặc khoá một tài khoản.
//
//   npm run create-admin -- --username admin [--name "Tên hiển thị"] [--promote]
//   npm run create-admin -- --disable ten_dang_nhap
//
// Mật khẩu được nhập ẩn khi chạy (hoặc đọc từ stdin khi chạy tự động) — không
// bao giờ nằm trong .env, tham số dòng lệnh hay lịch sử shell.
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
    if (a[i] === '--promote') out.flags.add('promote');
    else if (a[i].startsWith('--')) out[a[i].slice(2)] = a[++i];
  }
  return out;
}

/** Đọc một dòng không hiện ký tự (TTY) hoặc từ stdin khi được pipe. */
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

async function main() {
  loadEnv();
  const opt = args();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI (xem .env.example)');

  await mongoose.connect(uri);
  const users = mongoose.connection.db.collection('users');

  try {
    if (opt.disable) {
      const username = opt.disable.trim().toLowerCase();
      const target = await users.findOne({ username });
      if (!target) throw new Error(`Không có tài khoản ${username}`);
      if (target.role === 'admin') {
        const others = await users.countDocuments({ role: 'admin', isActive: true, username: { $ne: username } });
        if (others === 0) throw new Error('Đây là quản trị viên hoạt động cuối cùng — tạo tài khoản khác trước khi khoá');
      }
      await users.updateOne({ username }, { $set: { isActive: false, updatedAt: new Date() } });
      console.log(`Đã khoá ${username}.`);
      return;
    }

    const username = opt.username?.trim().toLowerCase();
    if (!username || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
      throw new Error('Cần --username hợp lệ (3–32 ký tự: a-z, 0-9, . _ -). Ví dụ: npm run create-admin -- --username admin');
    }

    const pw = await askHidden('Mật khẩu (ẩn): ');
    const bad = validatePassword(pw);
    if (bad) throw new Error(bad);
    if (process.stdin.isTTY) {
      const again = await askHidden('Nhập lại mật khẩu: ');
      if (again !== pw) throw new Error('Hai lần nhập không khớp');
    }
    const passwordHash = await bcrypt.hash(pw, 12);

    const existing = await users.findOne({ username });
    const now = new Date();
    if (!existing) {
      await users.insertOne({
        username,
        passwordHash,
        fullName: opt.name?.trim() || 'Quản trị viên',
        role: 'admin',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`Đã tạo quản trị viên ${username}.`);
    } else if (existing.role === 'admin' || opt.flags.has('promote')) {
      await users.updateOne({ username }, { $set: { passwordHash, role: 'admin', isActive: true, updatedAt: now } });
      console.log(`Đã đặt lại mật khẩu cho ${username}.`);
    } else {
      throw new Error(`${username} là người dùng thường — thêm --promote nếu muốn nâng lên quản trị viên`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error('Lỗi: ' + e.message);
  process.exit(1);
});
