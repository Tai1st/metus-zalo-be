import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { basename, join } from 'node:path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { CertSettingsService } from './cert-settings.service';

export interface CertAppInfo {
  path: string;
  name: string;
  version: string;
  bundleId: string;
  minOs: string;
  size: number;
}

/** App (IPA chưa ký) phát hành cho khách đã mua chứng chỉ. File nằm ngoài git, trong thư mục lưu trữ của BE. */
@Injectable()
export class CertAppService {
  constructor(
    private readonly settings: CertSettingsService,
    private readonly config: ConfigService,
  ) {}

  private get dir() {
    return this.config.get<string>('CERT_APP_DIR') || join(process.cwd(), 'storage', 'cert-shop');
  }

  /** Trả null nếu chưa cấu hình hoặc file không tồn tại. */
  async info(): Promise<CertAppInfo | null> {
    const s = await this.settings.get();
    if (!s.appFile) return null;
    // basename chặn đường dẫn kiểu ../ nếu giá trị trong DB bị sửa bậy
    const path = join(this.dir, basename(s.appFile));
    try {
      const st = await stat(path);
      if (!st.isFile()) return null;
      return {
        path,
        name: s.appName,
        version: s.appVersion,
        bundleId: s.appBundleId,
        minOs: s.appMinOs,
        size: st.size,
      };
    } catch {
      return null;
    }
  }

  /** Dung lượng tối đa mỗi lần tải lên (MB). Cloudflare gói thường giới hạn 100MB mỗi request. */
  get maxBytes() {
    return Number(this.config.get('CERT_APP_MAX_MB', 100)) * 1024 * 1024;
  }

  /**
   * Nhận IPA từ luồng dữ liệu thô, ghi ra file tạm, kiểm tra rồi đổi tên nguyên tử.
   * Chỉ sau khi file hợp lệ mới cập nhật DB và xóa bản cũ, nên upload lỗi không làm mất bản đang phát hành.
   */
  async saveUpload(
    stream: Readable,
    meta: { name: string; version: string; bundleId: string; minOs: string },
  ) {
    const dir = this.dir;
    await mkdir(dir, { recursive: true });
    const safeVersion = meta.version.replace(/[^A-Za-z0-9._-]/g, '');
    const finalName = `Metus-${safeVersion || Date.now()}.ipa`;
    const tmp = join(dir, `.upload-${Date.now()}.part`);

    const hash = createHash('sha256');
    let size = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tmp, { mode: 0o640 });
        stream.on('data', (c: Buffer) => {
          size += c.length;
          if (size > this.maxBytes) {
            reject(new PayloadTooLargeException(`File vượt quá ${this.maxBytes / 1048576}MB`));
            stream.destroy();
            out.destroy();
            return;
          }
          hash.update(c);
        });
        stream.on('error', reject);
        stream.on('aborted', () => reject(new BadRequestException('Tải lên bị ngắt')));
        out.on('error', reject);
        out.on('finish', resolve);
        stream.pipe(out);
      });

      if (size < 1024) throw new BadRequestException('File rỗng hoặc quá nhỏ');
      // IPA là file zip: phải mở đầu bằng "PK"
      const fh = await open(tmp, 'r');
      const head = Buffer.alloc(4);
      await fh.read(head, 0, 4, 0);
      await fh.close();
      if (head.toString('latin1') !== 'PK') {
        throw new BadRequestException('Không phải file IPA (zip) hợp lệ');
      }

      const before = (await this.settings.get()).appFile;
      await rename(tmp, join(dir, finalName));
      await this.settings.saveApp({ file: finalName, ...meta });
      // Xóa bản cũ nếu khác tên (cùng tên thì đã bị ghi đè ở bước rename)
      if (before && basename(before) !== finalName) {
        await rm(join(dir, basename(before)), { force: true });
      }
      return { file: finalName, size, sha256: hash.digest('hex') };
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  /** Gỡ app khỏi shop: khách không tải được nữa, đồng thời xóa file trên đĩa. */
  async remove() {
    const before = (await this.settings.get()).appFile;
    await this.settings.clearApp();
    if (before) await rm(join(this.dir, basename(before)), { force: true });
  }
}
