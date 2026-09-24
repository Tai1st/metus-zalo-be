import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PricePointDto } from '../../../common/dto/price-point.dto';

export class CreateAddonDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,30}$/, {
    message: 'Mã chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  code: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsInt()
  @Min(1)
  seats: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PricePointDto)
  prices: PricePointDto[];

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(31)
  requiresPlanCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
