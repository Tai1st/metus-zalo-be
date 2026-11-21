import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateLinkOrderDto {
  @IsString()
  @MaxLength(31)
  planCode: string;

  /** Thời hạn mua, phải là một trong các mức giá của gói. */
  @IsInt()
  @Min(1)
  @Max(60)
  months: number;
}

export class ConfirmLinkOrderDto {
  /** Mã giao dịch ngân hàng để đối soát (tuỳ chọn). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  txRef?: string;
}
