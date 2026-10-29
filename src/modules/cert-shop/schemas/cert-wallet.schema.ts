import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Số dư của một khách hàng, dùng để mua gói chứng chỉ trực tiếp thay VietQR. Lưu bằng VND (quy đổi
 * một lần ngay lúc nạp USDT được cộng, theo tỷ giá admin cấu hình tại thời điểm đó — xem
 * CertWalletService.credit()) để khớp đơn vị với giá bán gói, không phải tra tỷ giá mỗi lần mua.
 */
@Schema({ collection: 'cert_wallets', timestamps: true })
export class CertWallet {
  @Prop({ required: true, unique: true, index: true }) userId: string;
  @Prop({ required: true, default: 0 }) balanceVnd: number;
}

export type CertWalletDocument = HydratedDocument<CertWallet>;
export const CertWalletSchema = SchemaFactory.createForClass(CertWallet);
