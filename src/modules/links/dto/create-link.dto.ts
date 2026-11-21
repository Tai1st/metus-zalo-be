import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateLinkDto {
  /** Link chia sẻ vt/vm.tiktok.com hoặc link web tiktok.com đầy đủ. */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(4000)
  url: string;

  /** Tên miền dùng cho link (chọn trong /link-domains/available); bỏ trống = domain mặc định. */
  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  /** Tiêu đề hiển thị khi chia sẻ; bỏ trống thì lấy tên sản phẩm. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
