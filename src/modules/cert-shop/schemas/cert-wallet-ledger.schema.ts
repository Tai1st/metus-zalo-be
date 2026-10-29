import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Sổ cái bất biến mọi thay đổi số dư — mỗi lần cộng/trừ ghi đúng một dòng, không sửa/xóa. */
@Schema({ collection: 'cert_wallet_ledger', timestamps: true })
export class CertWalletLedger {
  @Prop({ required: true, index: true }) userId: string;
  /** VND, âm khi trừ (spend). */
  @Prop({ required: true }) amountVnd: number;
  @Prop({ required: true, enum: ['deposit', 'spend', 'refund'] }) kind: 'deposit' | 'spend' | 'refund';
  @Prop() depositId?: string;
  @Prop() orderCode?: string;
  /** Chặn cộng/trừ trùng: vd "binance-deposit:<providerDepositId>" hoặc "cert-order:<code>". */
  @Prop({ required: true, unique: true }) idempotencyKey: string;
}

export type CertWalletLedgerDocument = HydratedDocument<CertWalletLedger>;
export const CertWalletLedgerSchema = SchemaFactory.createForClass(CertWalletLedger);
