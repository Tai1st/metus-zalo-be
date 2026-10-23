import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, chown, copyFile, mkdir, open, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Readable } from 'node:stream';
import { CertSettingsService } from './cert-settings.service';
import { streamToFile } from './upload.util';

export type SignState = 'created' | 'waiting' | 'running' | 'done' | 'failed';

export interface AppMeta {
  bundleId: string;
  name: string;
  version: string;
}

interface Job {
  id: string;
  /** Mã bí mật trong liên kết tải/cài. iOS tải manifest và IPA không kèm cookie nên không dùng được phiên đăng nhập. */
  token: string;
  userId: string;
  state: SignState;
  error: string;
  dir: string;
  hasIpa: boolean;
  hasP12: boolean;
  hasProf: boolean;
  source?: AppMeta;
  signed?: AppMeta & { size: number };
  createdAt: number;
  expiresAt: number;
}

// Python chuẩn có sẵn trên server: đọc zip/plist (cả plist nhị phân) mà không cần thêm thư viện npm.
const PY_INSPECT = `
import sys, json, zipfile, plistlib
try:
    z = zipfile.ZipFile(sys.argv[1])
    if len(z.namelist()) > 20000 or sum(i.file_size for i in z.infolist()) > 3 * 1024**3:
        raise ValueError("Gói quá lớn hoặc bất thường")
    plists = [n for n in z.namelist() if n.startswith("Payload/") and n.endswith(".app/Info.plist") and n.count("/") == 2]
    if not plists:
        raise ValueError("Không tìm thấy ứng dụng trong Payload/")
    d = plistlib.loads(z.read(plists[0]))
    print(json.dumps({"bundleId": d.get("CFBundleIdentifier", ""), "name": d.get("CFBundleDisplayName") or d.get("CFBundleName", ""), "version": str(d.get("CFBundleShortVersionString", ""))}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

const PY_CERT = `
import sys, json, zipfile
# Chỉ lấy đúng .p12 và .mobileprovision, ghi ra tên cố định: không có chuyện ghi đè/đi lạc ra ngoài thư mục.
try:
    z = zipfile.ZipFile(sys.argv[1])
    infos = [i for i in z.infolist() if not i.is_dir()]
    if len(infos) > 50:
        raise ValueError("Gói chứng chỉ có quá nhiều file")
    pick = {}
    for i in infos:
        low = i.filename.lower()
        for ext, out in ((".p12", "cert.p12"), (".mobileprovision", "prov.mobileprovision")):
            if low.endswith(ext) and out not in pick and "__macosx" not in low:
                pick[out] = i
    if len(pick) < 2:
        raise ValueError("Gói chứng chỉ cần có cả file .p12 và .mobileprovision")
    for out, i in pick.items():
        if i.file_size > 2 * 1024**2:
            raise ValueError("File chứng chỉ quá lớn")
        with open(sys.argv[2] + "/" + out, "wb") as f:
            f.write(z.read(i))
    print(json.dumps({"ok": True}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

const run = (cmd: string, args: string[], timeoutMs = 30_000) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    ),
  );

/**
 * Ký IPA cho khách bằng chứng chỉ của chính họ (.p12 + .mobileprovision trong gói .zip).
 * Mỗi lần ký chạy trong thư mục tạm riêng, bằng tài khoản `nobody` (khi BE chạy root), có giới hạn
 * thời gian và bộ nhớ, chỉ một tiến trình ký tại một thời điểm. Chứng chỉ và mật khẩu không lưu vào DB, không ghi log.
 */
@Injectable()
export class CertSignService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CertSignService.name);
  private readonly jobs = new Map<string, Job>();
  private queue: string[] = [];
  private running = false;
  private timer?: NodeJS.Timeout;
  private nobody?: { uid: number; gid: number };
  /** Thời điểm bắt đầu các lượt ký gần đây của từng tài khoản (để giới hạn theo ngày). */
  private readonly usage = new Map<string, number[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly settings: CertSettingsService,
  ) {}

  private get root() {
    return this.config.get<string>('CERT_SIGN_DIR') || join(process.cwd(), 'storage', 'sign');
  }
  private get bin() {
    return this.config.get<string>('CERT_SIGN_BIN') || 'zsign';
  }
  private get python() {
    return this.config.get<string>('CERT_PYTHON') || 'python3';
  }
  get maxIpaBytes() {
    return Number(this.config.get('CERT_SIGN_MAX_MB', 100)) * 1048576;
  }
  readonly maxCertBytes = 5 * 1048576;
  /** File .p12 / .mobileprovision riêng lẻ chỉ vài KB, đặt trần 2MB. */
  private readonly maxPartBytes = 2 * 1048576;
  private get dailyLimit() {
    return Number(this.config.get('CERT_SIGN_DAILY', 10));
  }
  private get maxQueue() {
    return Number(this.config.get('CERT_SIGN_MAX_QUEUE', 8));
  }
  private readonly ttlMs = 60 * 60 * 1000;

  async onModuleInit() {
    // Job nằm trong bộ nhớ nên sau khi khởi động lại các thư mục cũ không còn chủ: dọn sạch.
    await rm(this.root, { recursive: true, force: true });
    await mkdir(this.root, { recursive: true, mode: 0o711 });
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      const u = spawnSync('id', ['-u', 'nobody']).stdout?.toString().trim();
      const g = spawnSync('id', ['-g', 'nobody']).stdout?.toString().trim();
      if (u && g) this.nobody = { uid: Number(u), gid: Number(g) };
    }
    this.timer = setInterval(() => void this.sweep(), 5 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** zsign đã cài và chạy được chưa. */
  async ready(): Promise<boolean> {
    const bin = this.bin;
    const dirs = bin.includes('/') || bin.includes('\\') ? [''] : (process.env.PATH ?? '').split(delimiter);
    for (const d of dirs) {
      try {
        await access(d ? join(d, bin) : bin, constants.X_OK);
        return true;
      } catch {
        /* thử thư mục tiếp theo */
      }
    }
    return false;
  }

  // ---- vòng đời job ----
  create(userId: string): Promise<Job> {
    const active = [...this.jobs.values()].filter((j) => j.userId === userId && j.expiresAt > Date.now()).length;
    if (active >= 3) throw new ConflictException('Bạn đang có quá nhiều lượt ký chưa hoàn tất, vui lòng đợi hoặc thử lại sau');
    return this.makeJob(userId);
  }

  private async makeJob(userId: string): Promise<Job> {
    const id = randomBytes(12).toString('hex');
    const dir = join(this.root, id);
    await mkdir(dir, { mode: 0o700 });
    await this.give(dir);
    const now = Date.now();
    const job: Job = {
      id,
      token: randomBytes(24).toString('hex'),
      userId,
      state: 'created',
      error: '',
      dir,
      hasIpa: false,
      hasP12: false,
      hasProf: false,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string, userId: string, admin = false): Job {
    const j = this.jobs.get(id);
    if (!j || j.expiresAt < Date.now() || (j.userId !== userId && !admin)) {
      throw new NotFoundException('Không tìm thấy lượt ký hoặc đã hết hạn');
    }
    return j;
  }

  byToken(token: string): Job {
    for (const j of this.jobs.values()) {
      if (j.token === token && j.state === 'done' && j.expiresAt > Date.now()) return j;
    }
    throw new NotFoundException('Liên kết không tồn tại hoặc đã hết hạn');
  }

  async saveIpa(job: Job, stream: Readable) {
    this.mustBe(job, 'created');
    const file = join(job.dir, 'in.ipa');
    try {
      await streamToFile(stream, file, this.maxIpaBytes);
      await this.give(file);
      await this.checkZipMagic(file, 'File không phải IPA (zip) hợp lệ');
      const meta = JSON.parse(await run(this.python, ['-I', '-c', PY_INSPECT, file]));
      if (meta.error) throw new BadRequestException(`IPA không hợp lệ: ${meta.error}`);
      job.source = meta;
      job.hasIpa = true;
      return meta as AppMeta;
    } catch (e) {
      await rm(file, { force: true });
      job.hasIpa = false;
      throw e;
    }
  }

  async saveCert(job: Job, stream: Readable) {
    this.mustBe(job, 'created');
    const zip = join(job.dir, 'cert.zip');
    try {
      await streamToFile(stream, zip, this.maxCertBytes);
      await this.checkZipMagic(zip, 'Gói chứng chỉ phải là file .zip');
      await this.ingestCertZip(job, zip);
    } finally {
      await rm(zip, { force: true });
    }
  }

  /** Tách .p12 và .mobileprovision từ một file zip đã nằm sẵn trên đĩa. */
  private async ingestCertZip(job: Job, zipPath: string) {
    try {
      const r = JSON.parse(await run(this.python, ['-I', '-c', PY_CERT, zipPath, job.dir]));
      if (r.error) throw new BadRequestException(r.error);
      await this.give(join(job.dir, 'cert.p12'));
      await this.give(join(job.dir, 'prov.mobileprovision'));
      job.hasP12 = true;
      job.hasProf = true;
    } catch (e) {
      job.hasP12 = false;
      job.hasProf = false;
      throw e;
    }
  }

  /**
   * Nạp IPA đã có sẵn trên server (vd app chính của shop) làm nguồn ký, không qua upload của khách.
   * Dùng cho nút "Cài đặt" một chạm: ký app của shop bằng chứng chỉ khách đã mua.
   */
  async useAppFile(job: Job, filePath: string, meta: AppMeta) {
    this.mustBe(job, 'created');
    const dest = join(job.dir, 'in.ipa');
    await copyFile(filePath, dest);
    await this.give(dest);
    job.source = meta;
    job.hasIpa = true;
  }

  /** Nạp gói chứng chỉ (.zip) đã có sẵn trong bộ nhớ (vd tải về từ nhà cung cấp), không qua upload của khách. */
  async useCertZipBuffer(job: Job, zip: Buffer) {
    this.mustBe(job, 'created');
    const zpath = join(job.dir, 'cert.zip');
    try {
      await writeFile(zpath, zip, { mode: 0o600 });
      await this.checkZipMagic(zpath, 'Gói chứng chỉ không hợp lệ');
      await this.ingestCertZip(job, zpath);
    } finally {
      await rm(zpath, { force: true });
    }
  }

  start(job: Job, opts: { password: string; bundleId?: string; name?: string }, admin = false) {
    this.mustBe(job, 'created');
    if (!job.hasIpa) throw new BadRequestException('Chưa tải file IPA lên');
    if (!job.hasP12 || !job.hasProf) throw new BadRequestException('Chưa có đủ chứng chỉ (.p12 và .mobileprovision)');
    if (this.queue.length >= this.maxQueue) {
      throw new ServiceUnavailableException('Hệ thống đang bận ký cho nhiều người, vui lòng thử lại sau ít phút');
    }
    this.useQuota(job.userId, admin);
    job.state = 'waiting';
    // Mật khẩu chỉ nằm trong bộ nhớ đến khi ký xong, không bao giờ ghi ra đĩa hay DB.
    (job as Job & { opts?: typeof opts }).opts = opts;
    this.queue.push(job.id);
    void this.pump();
    return job;
  }

  /** Số lượt ký còn lại trong 24 giờ qua (admin không giới hạn). */
  quotaLeft(userId: string, admin = false) {
    if (admin) return null;
    const since = Date.now() - 24 * 3600 * 1000;
    const used = (this.usage.get(userId) ?? []).filter((t) => t > since).length;
    return Math.max(0, this.dailyLimit - used);
  }

  private useQuota(userId: string, admin: boolean) {
    if (admin) return;
    const left = this.quotaLeft(userId);
    if (left === 0) {
      throw new HttpException(`Bạn đã dùng hết ${this.dailyLimit} lượt ký trong 24 giờ qua, vui lòng quay lại sau`, 429);
    }
    const since = Date.now() - 24 * 3600 * 1000;
    this.usage.set(userId, [...(this.usage.get(userId) ?? []).filter((t) => t > since), Date.now()]);
  }

  /** Nhập chứng chỉ thủ công: nhận riêng file .p12. */
  async saveP12(job: Job, stream: Readable) {
    this.mustBe(job, 'created');
    await this.savePart(job, stream, 'cert.p12', 'File .p12 không hợp lệ');
    job.hasP12 = true;
  }

  /** Nhập chứng chỉ thủ công: nhận riêng file .mobileprovision. */
  async saveProfile(job: Job, stream: Readable) {
    this.mustBe(job, 'created');
    await this.savePart(job, stream, 'prov.mobileprovision', 'File .mobileprovision không hợp lệ');
    job.hasProf = true;
  }

  private async savePart(job: Job, stream: Readable, name: string, message: string) {
    const file = join(job.dir, name);
    try {
      const size = await streamToFile(stream, file, this.maxPartBytes);
      if (size < 64) throw new BadRequestException(message);
      // Cả .p12 (PKCS#12) lẫn .mobileprovision (CMS) đều là DER, mở đầu bằng 0x30 (SEQUENCE).
      const fh = await open(file, 'r');
      const head = Buffer.alloc(1);
      await fh.read(head, 0, 1, 0);
      await fh.close();
      if (head[0] !== 0x30) throw new BadRequestException(message);
      await this.give(file);
    } catch (e) {
      await rm(file, { force: true });
      if (name === 'cert.p12') job.hasP12 = false;
      else job.hasProf = false;
      throw e;
    }
  }

  private mustBe(job: Job, s: SignState) {
    if (job.state !== s) throw new ConflictException('Lượt ký này đã được bắt đầu');
  }

  private async pump() {
    if (this.running) return;
    const id = this.queue.shift();
    if (!id) return;
    const job = this.jobs.get(id);
    if (!job) return void this.pump();
    this.running = true;
    job.state = 'running';
    try {
      await this.sign(job);
      job.state = 'done';
    } catch (e) {
      job.state = 'failed';
      job.error = e instanceof Error ? e.message : 'Ký thất bại';
    } finally {
      delete (job as Job & { opts?: unknown }).opts;
      // IPA gốc và chứng chỉ không cần giữ sau khi ký: xóa ngay để không lưu khóa riêng của khách.
      await Promise.all(['in.ipa', 'cert.p12', 'prov.mobileprovision'].map((f) => rm(join(job.dir, f), { force: true })));
      this.running = false;
      void this.pump();
    }
  }

  /** Dòng lệnh ký. Tách riêng để đổi/giả lập khi kiểm thử. */
  command(args: string[]): { cmd: string; argv: string[] } {
    // Giới hạn 3 phút CPU, 2,5GB bộ nhớ ảo, và chạy bằng nobody để một IPA độc hại không chạm được vào BE.
    const inner = ['sh', '-c', 'ulimit -t 180; ulimit -v 2500000; exec "$0" "$@"', this.bin, ...args];
    if (this.nobody) return { cmd: 'runuser', argv: ['-u', 'nobody', '--', 'timeout', '-k', '5', '200', ...inner] };
    return { cmd: this.bin, argv: args };
  }

  private async sign(job: Job) {
    const opts = (job as Job & { opts?: { password: string; bundleId?: string; name?: string } }).opts!;
    const out = join(job.dir, 'out.ipa');
    const args = [
      '-k', join(job.dir, 'cert.p12'),
      '-p', opts.password,
      '-m', join(job.dir, 'prov.mobileprovision'),
      '-o', out,
      '-z', '6',
      ...(opts.bundleId ? ['-b', opts.bundleId] : []),
      ...(opts.name ? ['-n', opts.name] : []),
      join(job.dir, 'in.ipa'),
    ];
    const { cmd, argv } = this.command(args);
    const output = await new Promise<string>((resolve, reject) => {
      const p = spawn(cmd, argv, { cwd: job.dir, stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      const grab = (c: Buffer) => {
        buf = (buf + c.toString()).slice(-4000);
      };
      p.stdout.on('data', grab);
      p.stderr.on('data', grab);
      p.on('error', (e) => reject(new Error(`Không chạy được công cụ ký: ${e.message}`)));
      p.on('close', (code) =>
        code === 0 ? resolve(buf) : reject(new Error(this.friendly(buf, opts.password, code))),
      );
    });
    void output;

    const st = await stat(out).catch(() => null);
    if (!st || st.size < 1024) throw new Error('Ký xong nhưng không tạo được file IPA');
    const meta = JSON.parse(await run(this.python, ['-I', '-c', PY_INSPECT, out]));
    if (meta.error) throw new Error(`IPA sau khi ký không hợp lệ: ${meta.error}`);
    job.signed = { ...meta, size: st.size };
    // Gia hạn hạn tải kể từ lúc ký xong.
    job.expiresAt = Date.now() + this.ttlMs;
  }

  /** Rút gọn lỗi của công cụ ký thành thông báo dễ hiểu, và không để lộ mật khẩu trong thông báo. */
  private friendly(output: string, password: string, code: number | null) {
    const clean = (password ? output.split(password).join('***') : output).trim();
    if (/mac verify|password|pkcs12|bad decrypt|invalid.*p12/i.test(clean)) {
      return 'Mật khẩu chứng chỉ sai hoặc file .p12 không hợp lệ';
    }
    if (/provision|profile/i.test(clean)) return 'File .mobileprovision không hợp lệ hoặc không khớp với chứng chỉ';
    if (code === 124 || code === 137) return 'Ký quá thời gian cho phép, hãy thử lại với file nhỏ hơn';
    return `Ký thất bại${clean ? `: ${clean.split('\n').slice(-2).join(' ').slice(0, 200)}` : ''}`;
  }

  // ---- hỗ trợ ----
  async manifest(job: Job) {
    const { siteUrl } = await this.settings.get();
    const s = job.signed!;
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${esc(`${siteUrl}/api/cert-shop/sign/dl/${job.token}/app.ipa`)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>${esc(s.bundleId)}</string><key>bundle-version</key><string>${esc(s.version || '1.0')}</string><key>kind</key><string>software</string><key>title</key><string>${esc(s.name || s.bundleId)}</string></dict>
</dict></array></dict></plist>`;
  }

  async view(job: Job) {
    const { siteUrl } = await this.settings.get();
    const base = `${siteUrl}/api/cert-shop/sign/dl/${job.token}`;
    return {
      id: job.id,
      state: job.state,
      error: job.error,
      source: job.source,
      signed: job.signed,
      expiresAt: job.expiresAt,
      ...(job.state === 'done' && {
        downloadUrl: `/api/cert-shop/sign/dl/${job.token}/app.ipa`,
        installUrl: `itms-services://?action=download-manifest&url=${encodeURIComponent(`${base}/manifest.plist`)}`,
      }),
    };
  }

  path(job: Job) {
    return join(job.dir, 'out.ipa');
  }

  private async checkZipMagic(file: string, message: string) {
    const fh = await open(file, 'r');
    const head = Buffer.alloc(4);
    await fh.read(head, 0, 4, 0);
    await fh.close();
    if (head.toString('latin1') !== 'PK\x03\x04') throw new BadRequestException(message);
  }

  /** Cho tài khoản chạy công cụ ký quyền đọc/ghi file của job (chỉ khi BE chạy bằng root). */
  private async give(path: string) {
    if (this.nobody) await chown(path, this.nobody.uid, this.nobody.gid);
  }

  private async sweep() {
    const now = Date.now();
    for (const [id, j] of this.jobs) {
      if (j.expiresAt < now && j.state !== 'running') {
        this.jobs.delete(id);
        await rm(j.dir, { recursive: true, force: true });
      }
    }
    // Thư mục không còn trong bộ nhớ (lỗi bất ngờ): xóa nốt.
    for (const d of await readdir(this.root).catch(() => [] as string[])) {
      if (!this.jobs.has(d)) await rm(join(this.root, d), { recursive: true, force: true });
    }
  }
}
