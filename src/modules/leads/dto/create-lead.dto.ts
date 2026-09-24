import { IsIn, IsString, MaxLength } from 'class-validator';

const SCALES = ['personal', 'small', 'medium', 'large'];

export class CreateLeadDto {
  @IsString() @MaxLength(100) fullName: string;
  @IsString() @MaxLength(20) phone: string;
  @IsIn(SCALES) scale: string;
}
