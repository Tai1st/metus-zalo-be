import { PayloadTooLargeException } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';

/** Ghi luồng dữ liệu xuống file, dừng ngay khi vượt giới hạn. Trả về số byte đã ghi. */
export function streamToFile(stream: Readable, file: string, maxBytes: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const out = createWriteStream(file, { mode: 0o600 });
    stream.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new PayloadTooLargeException(`File vượt quá ${Math.round(maxBytes / 1048576)}MB`));
        stream.destroy();
        out.destroy();
      }
    });
    stream.on('error', reject);
    stream.on('aborted', () => reject(new Error('Tải lên bị ngắt')));
    out.on('error', reject);
    out.on('finish', () => resolve(size));
    stream.pipe(out);
  });
}
