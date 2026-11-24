import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };

export class BioButtonDto {
  @IsString()
  @MaxLength(60)
  title: string;

  @IsUrl(URL_OPTS)
  @MaxLength(2048)
  url: string;
}

export class BioProductDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  price?: string;

  /** Ảnh sản phẩm: để trống hoặc đường dẫn https. */
  @IsOptional()
  @Matches(/^(https:\/\/[^\s]{4,500})?$/, { message: 'Ảnh phải là đường dẫn https' })
  image?: string;

  @IsUrl(URL_OPTS)
  @MaxLength(2048)
  url: string;
}

export class SaveBioDto {
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{2,31}$/, {
    message: 'Tên trang dài 3-32 ký tự, chỉ gồm chữ, số và gạch ngang',
  })
  slug: string;

  @IsIn(['neon', 'glass', 'sunset'])
  template: 'neon' | 'glass' | 'sunset';

  @IsString()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  handle?: string;

  @IsOptional()
  @Matches(/^(https:\/\/[^\s]{4,500})?$/, { message: 'Ảnh đại diện phải là đường dẫn https' })
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BioButtonDto)
  buttons: BioButtonDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BioProductDto)
  products: BioProductDto[];

  /** Xuất bản trang (chỉ gói trả phí). */
  @IsBoolean()
  published: boolean;
}
