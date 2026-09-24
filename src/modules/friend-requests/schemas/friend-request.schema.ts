import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Lời mời kết bạn NHẬN được — zca-js không có API liệt kê lại lịch sử, chỉ
 * bắn sự kiện real-time (FriendEventType.REQUEST) khi tài khoản đang kết
 * nối, nên Next ghi lại từng sự kiện vào đây ngay lúc nhận được.
 */
@Schema({ collection: 'friend_requests' })
export class FriendRequest {
  @Prop({ required: true, unique: true })
  seq: number;

  /** zaloId của tài khoản NHẬN lời mời. */
  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true })
  fromUid: string;

  @Prop({ default: '' })
  fromName: string;

  @Prop({ default: '' })
  fromAvatar: string;

  @Prop({ default: '' })
  message: string;

  @Prop({ required: true, default: 'pending' })
  status: 'pending' | 'accepted' | 'rejected';

  @Prop({ required: true })
  receivedAt: string;

  @Prop({ required: true })
  updatedAt: string;
}

export type FriendRequestDocument = HydratedDocument<FriendRequest>;
export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);
FriendRequestSchema.index({ accountId: 1, fromUid: 1 }, { unique: true });
