import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const DEVICES = ['windows', 'macos', 'linux', 'ios', 'android'] as const;
export type Device = (typeof DEVICES)[number];

const urlOpts = { protocols: ['http', 'https'], require_protocol: true };

export class GeoRuleDto {
  /** Mã quốc gia ISO 3166-1 alpha-2, ví dụ VN. */
  @Matches(/^[A-Za-z]{2}$/, { message: 'Mã quốc gia gồm 2 chữ cái' })
  country: string;

  /** Tỉnh/thành (tuỳ chọn, rỗng = cả quốc gia). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @IsUrl(urlOpts)
  @MaxLength(2048)
  url: string;
}

export class DeviceRuleDto {
  @IsIn(DEVICES as unknown as string[])
  device: Device;

  @IsUrl(urlOpts)
  @MaxLength(2048)
  url: string;
}

export class LangRuleDto {
  /** Mã ngôn ngữ 2 chữ cái, ví dụ vi, en. */
  @Matches(/^[A-Za-z]{2}$/, { message: 'Mã ngôn ngữ gồm 2 chữ cái' })
  lang: string;

  @IsUrl(urlOpts)
  @MaxLength(2048)
  url: string;
}

export class ParamDto {
  @Matches(/^[A-Za-z0-9_.-]{1,40}$/, { message: 'Tên tham số chỉ gồm chữ, số, _ . -' })
  key: string;

  @IsString()
  @MaxLength(200)
  value: string;
}

/** Tùy chọn nâng cao của link thường (dùng chung cho tạo và sửa). */
export class LinkExtrasDto {
  /** Mật khẩu bảo vệ (4–64 ký tự). Khi sửa: chuỗi rỗng = gỡ mật khẩu. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  password?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => GeoRuleDto)
  geoRules?: GeoRuleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DeviceRuleDto)
  deviceRules?: DeviceRuleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LangRuleDto)
  langRules?: LangRuleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ParamDto)
  params?: ParamDto[];
}

export class BannerUploadDto {
  /** Ảnh PNG/JPEG mã hóa base64 (có thể kèm tiền tố data:...;base64,). */
  @IsString()
  @MinLength(20)
  @MaxLength(900_000)
  data: string;
}

export class UnlockDto {
  @IsString()
  @MaxLength(64)
  password: string;
}
