import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateLinkDto {
  /** Đổi tiêu đề hiển thị khi chia sẻ. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

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
