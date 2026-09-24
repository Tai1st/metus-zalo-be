import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1, { message: 'Nhập tên đăng nhập' })
  @MaxLength(32)
  username: string;

  @IsString()
  @MaxLength(72)
  password: string;
}
