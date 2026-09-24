import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertAccountDto {
  @IsString() @MaxLength(64) zaloId: string;
  @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @IsOptional() @IsString() @MaxLength(1000) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() isBusiness?: boolean;
  // zca-js's QR login always issues randomUUID() + "-" + md5(userAgent) = 69
  // chars (see generateZaloUUID in zca-js/dist/utils.js) — 128 leaves room
  // without accepting arbitrary junk.
  @IsString() @MaxLength(128) imei: string;
  @IsString() @MaxLength(500) userAgent: string;
  /** Plaintext JSON cookie jar — encrypted before it touches the database. */
  @IsString() cookies: string;
}
