import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CertOrderStatus } from '../schemas/cert-order.schema';

export class ShopRegisterDto {
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/, {
    message:
      'Tên đăng nhập dài 3–32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới và gạch ngang',
  })
  username: string;

  // bcrypt chỉ đọc 72 byte đầu.
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;
}

export class ShopLoginDto {
  @IsString()
  @MinLength(1, { message: 'Nhập tên đăng nhập' })
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(1, { message: 'Nhập mật khẩu' })
  @MaxLength(72)
  password: string;
}

export class CreateOrderDto {
  @IsString() @MinLength(1) @MaxLength(128) enrollToken: string;
  @IsString() @MinLength(1) @MaxLength(64) planId: string;
}

export class UpdateCertSettingsDto {
  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(200) siteUrl?: string;
  @IsOptional() @IsString() @MaxLength(20) bankId?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccountNo?: string;
  @IsOptional() @IsString() @MaxLength(100) bankAccountName?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(10) priceMarkup?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) priceRoundTo?: number;

  /** Mỗi phần tử một dòng mô tả quyền lợi của gói. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(200, { each: true })
  planFeatures?: string[];

  @IsOptional() @IsUrl() @MaxLength(200) chungchiBaseUrl?: string;
  /** Rỗng/không gửi = giữ khóa hiện tại. */
  @IsOptional() @IsString() @MaxLength(300) chungchiApiKey?: string;
  @IsOptional() @IsString() @MaxLength(300) webhookSecret?: string;
}

export class AdminOrdersQuery {
  @IsOptional()
  @IsIn(Object.values(CertOrderStatus))
  status?: CertOrderStatus;

  @IsOptional() @IsString() @MaxLength(64) q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
