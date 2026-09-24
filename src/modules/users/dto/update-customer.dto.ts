import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nhập họ tên' })
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
