import { LinkExtrasDto } from './link-extras.dto';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateLinkDto extends LinkExtrasDto {
  /** Đổi tiêu đề hiển thị khi chia sẻ. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** Link thường: kiểu chuyển hướng. */
  @IsOptional()
  @IsIn(['direct', 'interstitial'])
  redirectType?: 'direct' | 'interstitial';

  /** Link thường: ghi chú nội bộ. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  /** Link thường: mô tả trong thẻ xem trước (chuỗi rỗng = xóa). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Link thường: ảnh xem trước, https (chuỗi rỗng = xóa). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image?: string;

  /** true = lưu trữ (ngừng hoạt động), false = khôi phục. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class InspectLinkDto {
  /** Link TikTok cần kiểm tra (không lưu lại). */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(4000)
  url: string;
}
