import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProxyInputDto {
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsIn(['http', 'socks5']) protocol: 'http' | 'socks5';
  @IsString() @MaxLength(255) host: string;
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsOptional() @IsString() @MaxLength(200) username?: string;
  @IsOptional() @IsString() @MaxLength(200) password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(64) ownerId?: string;
}
