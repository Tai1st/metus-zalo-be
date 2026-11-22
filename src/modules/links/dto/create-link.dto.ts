import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class CreateLinkDto {
  /**
   * Loại rút gọn: `deeplink` (mặc định) = link TikTok Shop mở thẳng ứng dụng; `normal` = link thường bất kỳ (http/https).
   */
  @IsOptional()
  @IsIn(['deeplink', 'normal'])
  mode?: 'deeplink' | 'normal';

  /** Deeplink: link chia sẻ vt/vm.tiktok.com hoặc link web tiktok.com. Normal: đường dẫn http/https bất kỳ. */
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  /** Tên miền dùng cho link (chọn trong /link-domains/available); bỏ trống = domain mặc định. */
  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  /** Link thường: tên tùy chỉnh thay cho mã ngẫu nhiên (3–32 ký tự: chữ, số, gạch ngang, gạch dưới). */
  @IsOptional()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/, {
    message: 'Tên tùy chỉnh dài 3–32 ký tự, chỉ gồm chữ, số, gạch ngang và gạch dưới',
  })
  alias?: string;

  /** Link thường: kiểu chuyển hướng. `direct` = ngay lập tức; `interstitial` (mặc định) = trang trung gian có thẻ xem trước. */
  @IsOptional()
  @IsIn(['direct', 'interstitial'])
  redirectType?: 'direct' | 'interstitial';

  /** Link thường: ghi chú nội bộ (không hiển thị cho người bấm). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  /** Link thường: mô tả hiện trong thẻ xem trước khi chia sẻ (tuỳ chọn). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Link thường: ảnh xem trước, đường dẫn https tới ảnh (tuỳ chọn). */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  image?: string;

  /** Tiêu đề hiển thị khi chia sẻ; bỏ trống thì lấy tên sản phẩm. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
