import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

class ThreadNameItemDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsString() avatar: string;
}

export class UpsertThreadNamesDto {
  @IsString() zaloId: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ThreadNameItemDto)
  threads: ThreadNameItemDto[];
}
