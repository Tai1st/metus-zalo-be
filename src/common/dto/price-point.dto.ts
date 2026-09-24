import { IsInt, Max, Min } from 'class-validator';

export class PricePointDto {
  @IsInt()
  @Min(1)
  @Max(60)
  months: number;

  @IsInt()
  @Min(0)
  price: number;
}
