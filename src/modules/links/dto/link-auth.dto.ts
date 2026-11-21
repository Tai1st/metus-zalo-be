import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LinkRegisterDto {
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

export class LinkLoginDto {
  @IsString()
  @MinLength(1, { message: 'Nhập tên đăng nhập' })
  @MaxLength(32)
  username: string;

  @IsString()
  @MaxLength(72)
  password: string;
}
