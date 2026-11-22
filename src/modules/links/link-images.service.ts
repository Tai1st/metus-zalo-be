import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LinkImage, LinkImageDocument } from './schemas/link-image.schema';

const MAX_BYTES = 500 * 1024;
const MAX_PER_USER = 100;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

@Injectable()
export class LinkImagesService {
  constructor(
    @InjectModel(LinkImage.name) private readonly model: Model<LinkImageDocument>,
    private readonly config: ConfigService,
  ) {}

  async upload(ownerId: string, b64: string): Promise<{ url: string }> {
    const raw = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new BadRequestException('Dữ liệu ảnh không hợp lệ');
    const data = Buffer.from(raw, 'base64');
    if (data.length > MAX_BYTES) throw new BadRequestException('Banner tối đa 500KB');
    // Nhận diện theo nội dung thật, không tin phần mở rộng hay MIME do client gửi.
    let mime: 'image/png' | 'image/jpeg';
    if (data.length > 8 && data.subarray(0, 8).equals(PNG_MAGIC)) mime = 'image/png';
    else if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mime = 'image/jpeg';
    else throw new BadRequestException('Banner phải là ảnh PNG hoặc JPEG');

    if ((await this.model.countDocuments({ ownerId })) >= MAX_PER_USER) {
      throw new BadRequestException(`Đã đạt tối đa ${MAX_PER_USER} banner`);
    }
    const doc = await this.model.create({ ownerId, mime, data });
    const base = this.config.get<string>('LINKS_PUBLIC_API_URL', 'https://api-v3.metus.vn').replace(/\/+$/, '');
    return { url: `${base}/api/public/link-images/${doc.id}` };
  }

  async get(id: string) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Không tìm thấy ảnh');
    return doc;
  }
}
