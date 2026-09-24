import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ProfileUpdateDto {
  @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) avatarUrl?: string;
  @IsOptional() @IsBoolean() isBusiness?: boolean;
}
