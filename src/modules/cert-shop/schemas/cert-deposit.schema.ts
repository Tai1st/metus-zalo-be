import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum CertDepositStatus {
  Pending = 'pending',
  Credited = 'credited',
  Expired = 'expired',
  ManualReview = 'manual_review',
  Cancelled = 'cancelled',
}

/**
 * Một lượt nạp USDT qua Binance. `expectedAmountMicro` là số tiền được cấp riêng (duy nhất vĩnh viễn
 * theo network+address, không tái sử dụng kể cả khi đơn hết hạn/hủy) để đối soát tự động không cần
 * memo — xem CertWalletService.reserveAmount().
 */
@Schema({ collection: 'cert_deposits', timestamps: true })
export class CertDeposit {
  @Prop({ required: true, index: true }) userId: string;
  /** Mã mạng Binance thật (vd 'BSC', 'TRX') — dùng để khớp với trường network của Binance deposit/hisrec. */
  @Prop({ required: true }) network: string;
  /** Nhãn hiển thị snapshot lúc tạo (vd 'BEP20') — đổi cấu hình admin sau này không ảnh hưởng lượt đã tạo. */
  @Prop({ required: true }) networkLabel: string;
  @Prop({ required: true }) address: string;
  @Prop({ required: true }) requestedAmountMicro: number;
  @Prop({ required: true }) serviceFeeMicro: number;
  @Prop({ required: true }) adjustmentMicro: number;
  /** = requestedAmountMicro + serviceFeeMicro + adjustmentMicro — số tiền khách phải chuyển chính xác. */
  @Prop({ required: true }) expectedAmountMicro: number;
  /** = expectedAmountMicro - serviceFeeMicro — số được cộng vào ví khi khớp. */
  @Prop({ required: true }) creditAmountMicro: number;
  @Prop({
    type: String,
    enum: Object.values(CertDepositStatus),
    default: CertDepositStatus.Pending,
    index: true,
  })
  status: CertDepositStatus;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() creditedAt?: Date;
  /** Gắn sau khi worker khớp được giao dịch Binance tương ứng. */
  @Prop() providerDepositId?: string;
  @Prop() txId?: string;
  /** Snapshot tỷ giá USDT→VND và số VND thực cộng tại thời điểm credit (không đổi về sau dù tỷ giá admin cập nhật). */
  @Prop() creditedVndRate?: number;
  @Prop() creditedVnd?: number;
  /** Khi có giá trị: đây là lượt trả trực tiếp cho 1 đơn (không cộng ví) — xem CertWalletService.orderPayment(). */
  @Prop() orderId?: string;
  @Prop({ index: true }) orderCode?: string;
}

export type CertDepositDocument = HydratedDocument<CertDeposit>;
export const CertDepositSchema = SchemaFactory.createForClass(CertDeposit);

// Số tiền cấp riêng không bao giờ được trùng trên cùng network+address, kể cả đơn cũ đã
// hết hạn/hủy — đây là hàng rào cuối chống đối soát nhầm, không chỉ dựa vào code sinh số ngẫu nhiên.
CertDepositSchema.index({ network: 1, address: 1, expectedAmountMicro: 1 }, { unique: true });
CertDepositSchema.index({ providerDepositId: 1 }, { unique: true, sparse: true });
