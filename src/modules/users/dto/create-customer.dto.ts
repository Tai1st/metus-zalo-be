import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCustomerDto {
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/, {
    message:
      'Tên đăng nhập dài 3–32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới và gạch ngang',
  })
  username: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  password: string;

  @IsString()
  @MinLength(1, { message: 'Nhập họ tên' })
  @MaxLength(100)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
