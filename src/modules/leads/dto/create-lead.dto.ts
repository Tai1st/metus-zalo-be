import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SCALES = ['personal', 'small', 'medium', 'large'];

export class CreateLeadDto {
  @IsString() @MaxLength(100) fullName: string;
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải đủ 10 số và bắt đầu bằng số 0',
  })
  phone: string;
  @IsIn(SCALES) scale: string;
  @IsOptional() @IsString() @MaxLength(100) referrer?: string;
}
