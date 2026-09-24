import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AddLogDto {
  @IsString() target: string;
  @IsOptional() @IsString() accountId?: string;
  @IsBoolean() ok: boolean;
  @IsOptional() @IsString() message?: string;
}

export class BumpCountersDto {
  @IsBoolean() ok: boolean;
}
