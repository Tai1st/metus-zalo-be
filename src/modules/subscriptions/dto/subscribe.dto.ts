import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class SubscribeDto {
  @IsMongoId({ message: 'Gói cước không hợp lệ' })
  planId: string;

  /** Billing period, must be one the plan offers (3 / 6 / 12). */
  @IsInt({ message: 'Chu kỳ không hợp lệ' })
  @Min(1)
  @Max(60)
  months: number;

  /** Optional "+N tài khoản nhân sự" pack (Business only). */
  @IsOptional()
  @IsMongoId({ message: 'Gói mua thêm không hợp lệ' })
  addonId?: string;
}
