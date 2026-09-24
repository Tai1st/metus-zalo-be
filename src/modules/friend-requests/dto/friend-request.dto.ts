import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateFriendRequestDto {
  @IsString() accountId: string;
  @IsString() fromUid: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() fromAvatar?: string;
  @IsOptional() @IsString() message?: string;
  /** Thời điểm thật Zalo ghi nhận lời mời (ISO) — không truyền thì dùng lúc
   * server ghi nhận (trường hợp sự kiện real-time, không có mốc gốc khác). */
  @IsOptional() @IsString() receivedAt?: string;
}

export class UpdateFriendRequestStatusDto {
  @IsIn(['accepted', 'rejected']) status: 'accepted' | 'rejected';
}
