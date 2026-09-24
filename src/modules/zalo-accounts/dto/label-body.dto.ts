import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateLabelDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
}

export class UpdateLabelDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
}
