import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class AttachmentDto {
  @IsString() href: string;
  @IsString() thumb: string;
  @IsString() title: string;
  @IsBoolean() isImage: boolean;
}

export class PersistMessageDto {
  @IsString() zaloId: string;
  @IsString() id: string; // msgId
  @IsString() threadId: string;
  @IsIn([0, 1]) threadType: number;
  @IsBoolean() isSelf: boolean;
  @IsOptional() @IsString() fromId?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() content?: string;
  @IsInt() ts: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto;
  @IsOptional() @IsInt() stickerId?: number;
  @IsOptional() @IsString() systemLabel?: string;
}
