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
  ValidateNested,
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

  /** Mật khẩu .p12 do khách đặt; bỏ trống thì hệ thống tự tạo ngẫu nhiên. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{1,32}$/, { message: 'Mật khẩu chứng chỉ chỉ gồm chữ và số, tối đa 32 ký tự' })
  p12Password?: string;

  /** 'balance' = trả ngay bằng số dư ví; 'usdt' = chuyển USDT trực tiếp cho đơn này. Mặc định vietqr. */
  @IsOptional() @IsIn(['vietqr', 'balance', 'usdt']) paymentMethod?: 'vietqr' | 'balance' | 'usdt';
}

export class CreateDepositDto {
  /** USDT, tối đa 6 chữ số thập phân — BE tự nhân 1e6 và validate min/max theo cấu hình. */
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) requestedAmount: number;
  /** Khóa mạng nội bộ, vd 'bep20' | 'ton' | 'arbitrum' | 'polygon' | 'trc20'. */
  @IsString() @MinLength(1) @MaxLength(20) network: string;
}

export class UsdtOrderPaymentDto {
  @IsString() @MinLength(1) @MaxLength(20) network: string;
}

export class UsdtNetworkConfigDto {
  @IsString() @MinLength(1) @MaxLength(20) key: string;
  @IsString() @MinLength(1) @MaxLength(40) label: string;
  @IsOptional() @IsString() @MaxLength(40) binanceNetwork?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) feeMicro?: number;
  @IsOptional() enabled?: boolean;
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
  @IsOptional() @IsString() @MaxLength(300) web2mToken?: string;

  @IsOptional() @IsString() @MaxLength(300) binanceApiKey?: string;
  @IsOptional() @IsString() @MaxLength(300) binanceApiSecret?: string;
  /** Gửi lại toàn bộ bảng mạng mỗi lần lưu (thay nguyên mảng, không patch từng dòng). */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => UsdtNetworkConfigDto)
  usdtNetworks?: UsdtNetworkConfigDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) depositMinMicro?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) depositMaxMicro?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usdtVndRate?: number;
}

export class CheckCertDto {
  /** Gói chứng chỉ .zip mã hóa base64 (tối đa khoảng 1MB sau khi giải mã). */
  @IsString() @MaxLength(1_500_000) zip: string;

  @IsString() @MaxLength(128) password: string;
}

export class StartSignDto {
  /** Mật khẩu .p12 (có thể để trống nếu chứng chỉ không đặt mật khẩu). */
  @IsString() @MaxLength(128) password: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]{0,100}$/, { message: 'Bundle ID chỉ gồm chữ, số, dấu chấm và gạch ngang' })
  bundleId?: string;

  @IsOptional() @IsString() @MaxLength(60) name?: string;
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

export class ImportRepoDto {
  @IsUrl({ require_tld: false }) @MaxLength(2000) url: string;
}
