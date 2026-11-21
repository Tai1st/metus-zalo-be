import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin thêm domain vào kho mặc định. */
export class CreateSystemDomainDto {
  @IsString()
  @MaxLength(253)
  host: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSystemDomainDto extends PartialType(CreateSystemDomainDto) {}

/** Người dùng thêm domain riêng. */
export class AddCustomDomainDto {
  @IsString()
  @MaxLength(253)
  host: string;
}
