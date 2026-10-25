import { BadRequestException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { Model } from 'mongoose';
import { CertQuickApp, CertQuickAppDocument } from './schemas/cert-quick-app.schema';

export interface RepoAppEntry {
  name: string;
  bundleIdentifier: string;
  version: string;
  iconURL?: string;
  downloadURL: string;
  size?: number | string;
}

// Giống PY_INSPECT trong cert-sign.service.ts: đọc Info.plist trong Payload/*.app bằng Python chuẩn có sẵn trên server.
const PY_INSPECT = `
import sys, json, zipfile, plistlib
try:
    z = zipfile.ZipFile(sys.argv[1])
    plists = [n for n in z.namelist() if n.startswith("Payload/") and n.endswith(".app/Info.plist") and n.count("/") == 2]
    if not plists:
        raise ValueError("Khong tim thay ung dung trong Payload/")
    d = plistlib.loads(z.read(plists[0]))
    print(json.dumps({"bundleId": d.get("CFBundleIdentifier", ""), "name": d.get("CFBundleDisplayName") or d.get("CFBundleName", ""), "version": str(d.get("CFBundleShortVersionString", "")), "minOs": str(d.get("MinimumOSVersion", ""))}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { timeout: 15_000, maxBuffer: 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );

export interface QuickAppInfo {
  slug: string;
  name: string;
  version?: string;
  bundleId?: string;
  minOs?: string;
  size?: number;
}

/**
 * Các app tiện ích (vd ESign) có sẵn trên server để khách chọn nhanh làm nguồn ký ở trang Ký IPA,
 * thay vì phải tự tải file lên. Dùng chung thư mục lưu trữ với app chính của shop (đã đặt quyền đúng:
 * root sở hữu, "other" không liệt kê/đọc được — tiến trình ký đọc file này khi còn là root, trước khi
 * hạ quyền xuống nobody, nên không cần nobody có quyền trên thư mục này).
 */
@Injectable()
export class CertQuickAppService {
  constructor(
    @InjectModel(CertQuickApp.name) private readonly model: Model<CertQuickAppDocument>,
    private readonly config: ConfigService,
  ) {}

  private get dir() {
    return this.config.get<string>('CERT_APP_DIR') || join(process.cwd(), 'storage', 'cert-shop');
  }
  private get python() {
    return this.config.get<string>('CERT_PYTHON') || 'python3';
  }

  get maxBytes() {
    return Number(this.config.get('CERT_QUICKAPP_MAX_MB', 150)) * 1048576;
  }

  async list(): Promise<QuickAppInfo[]> {
    const rows = await this.model.find().sort({ name: 1 });
    return rows.map((r) => ({ slug: r.slug, name: r.name, version: r.version, bundleId: r.bundleId, minOs: r.minOs, size: r.size }));
  }

  /** Đường dẫn file thật trên đĩa cho một slug, hoặc null nếu chưa có / file đã mất. */
  async path(slug: string): Promise<{ path: string; info: QuickAppInfo } | null> {
    const row = await this.model.findOne({ slug: slug.toLowerCase() });
    if (!row) return null;
    const path = join(this.dir, basename(row.file));
    try {
      await stat(path);
    } catch {
      return null;
    }
    return { path, info: { slug: row.slug, name: row.name, version: row.version, bundleId: row.bundleId, minOs: row.minOs, size: row.size } };
  }

  /** Đọc mảng "apps" của một repo.json (định dạng AltStore/SideStore chuẩn) để admin xem và chọn, chưa tải gì cả. */
  async previewRepo(url: string): Promise<{ name: string; apps: RepoAppEntry[] }> {
    const u = this.parseHttpUrl(url, 'URL repo không hợp lệ');
    let res: Response;
    try {
      res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new BadRequestException('Không kết nối được tới repo');
    }
    if (!res.ok) throw new BadRequestException(`Không tải được repo (HTTP ${res.status})`);
    const json = await res.json().catch(() => null);
    if (!json || !Array.isArray(json.apps)) throw new BadRequestException('Không đúng định dạng repo.json (thiếu mảng "apps")');
    const apps: RepoAppEntry[] = json.apps
      .slice(0, 300)
      .map((a: Record<string, unknown>) => ({
        name: String(a?.name ?? '').slice(0, 120),
        bundleIdentifier: String(a?.bundleIdentifier ?? '').slice(0, 120),
        version: String(a?.version ?? '').slice(0, 40),
        iconURL: typeof a?.iconURL === 'string' ? a.iconURL : undefined,
        downloadURL: typeof a?.downloadURL === 'string' ? a.downloadURL : '',
        size: typeof a?.size === 'number' || typeof a?.size === 'string' ? a.size : undefined,
      }))
      .filter((a: RepoAppEntry) => a.downloadURL);
    return { name: String(json.name ?? ''), apps };
  }

  /** Admin chọn một app trong repo.json để thêm: BE tự tải IPA từ downloadURL và lưu, không qua trình duyệt của admin. */
  async importFromUrl(slug: string, name: string, downloadURL: string) {
    const u = this.parseHttpUrl(downloadURL, 'Link tải file không hợp lệ');
    let res: Response;
    try {
      res = await fetch(u, { signal: AbortSignal.timeout(120_000) });
    } catch {
      throw new BadRequestException('Không tải được file từ link đã chọn');
    }
    if (!res.ok || !res.body) throw new BadRequestException(`Không tải được file (HTTP ${res.status})`);
    return this.ingest(slug, name, Readable.fromWeb(res.body as never));
  }

  private parseHttpUrl(raw: string, errMsg: string): URL {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BadRequestException(errMsg);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadRequestException(errMsg);
    return u;
  }

  async upload(slug: string, name: string, stream: Readable) {
    return this.ingest(slug, name, stream);
  }

  private async ingest(slug: string, name: string, stream: Readable) {
    const clean = slug.toLowerCase().trim();
    if (!/^[a-z0-9-]{1,32}$/.test(clean)) throw new BadRequestException('Slug chỉ gồm chữ thường, số và gạch ngang');
    const file = `quick-${clean}.ipa`;
    const dest = join(this.dir, file);
    const tmp = `${dest}.part`;

    const hash = createHash('sha256');
    let size = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tmp, { mode: 0o640 });
        stream.on('data', (c: Buffer) => {
          size += c.length;
          if (size > this.maxBytes) {
            reject(new BadRequestException(`File vượt quá ${this.maxBytes / 1048576}MB`));
            stream.destroy();
            out.destroy();
            return;
          }
          hash.update(c);
        });
        stream.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        stream.pipe(out);
      });

      if (size < 1024) throw new BadRequestException('File rỗng hoặc quá nhỏ');
      const fh = await open(tmp, 'r');
      const head = Buffer.alloc(4);
      await fh.read(head, 0, 4, 0);
      await fh.close();
      if (head.toString('latin1') !== 'PK\x03\x04') throw new BadRequestException('Không phải file IPA (zip) hợp lệ');
      const meta = JSON.parse(await run(this.python, ['-I', '-c', PY_INSPECT, tmp]));
      if (meta.error) throw new BadRequestException(`IPA không hợp lệ: ${meta.error}`);

      const { rename } = await import('node:fs/promises');
      await rename(tmp, dest);
      await this.model.updateOne(
        { slug: clean },
        {
          $set: {
            name: name.trim() || meta.name || clean,
            file,
            size,
            version: meta.version || undefined,
            bundleId: meta.bundleId || undefined,
            minOs: meta.minOs || undefined,
          },
          $setOnInsert: { slug: clean },
        },
        { upsert: true },
      );
      return { slug: clean, size, sha256: hash.digest('hex'), meta };
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async remove(slug: string) {
    const clean = slug.toLowerCase();
    const row = await this.model.findOne({ slug: clean });
    if (row) await rm(join(this.dir, basename(row.file)), { force: true });
    await this.model.deleteOne({ slug: clean });
  }
}
