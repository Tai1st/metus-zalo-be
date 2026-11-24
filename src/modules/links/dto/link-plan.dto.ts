import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PricePointDto } from '../../../common/dto/price-point.dto';
import {
  ArrayMaxSize,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLinkPlanDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,30}$/, {
    message: 'Mã gói chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  code: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsInt()
  @Min(0)
  limit: number;

  @IsIn(['day', 'week', 'month'])
  period: 'day' | 'week' | 'month';

  /** Giá theo thời hạn mua; mỗi số tháng chỉ xuất hiện một lần. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PricePointDto)
  prices?: PricePointDto[];

  /** % giảm khi mua 3 tháng (giá 3 tháng được tự tính từ giá 1 tháng). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  discount3?: number;

  /** % giảm khi mua 12 tháng (giá 12 tháng được tự tính từ giá 1 tháng). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  discount12?: number;

  /** Domain hệ thống gói được dùng (host); để trống = tất cả. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  systemDomains?: string[];

  /** Số tên miền riêng được thêm; 0 = không hỗ trợ. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxCustomDomains?: number;

  /** Số deeplink Shopee mỗi chu kỳ; 0 = không có. */
  @IsOptional()
  @IsInt()
  @Min(0)
  shopeeLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Gắn nhãn "Khuyên chọn" trên bảng giá. */
  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateLinkPlanDto extends PartialType(
  OmitType(CreateLinkPlanDto, ['code'] as const),
) {}

export class AssignLinkPlanDto {
  @IsMongoId()
  userId: string;

  @IsString()
  planCode: string;

  /** ISO 8601; bỏ trống = không hết hạn. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
