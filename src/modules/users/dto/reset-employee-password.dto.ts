import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetEmployeePasswordDto {
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  newPassword: string;
}
