import { IsArray, IsInt } from 'class-validator';

export class LabelIdsDto {
  @IsArray() @IsInt({ each: true }) labelIds: number[];
}
