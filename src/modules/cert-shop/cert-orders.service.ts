import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomInt } from 'node:crypto';
import { CertSettingsService, ShopSettings } from './cert-settings.service';
import { ChungchiClient, ProviderError, ProviderOrder } from './chungchi.client';
import {
  CertOrder,
  CertOrderDocument,
  CertOrderStatus,
} from './schemas/cert-order.schema';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class CertOrdersService {
  private readonly log = new Logger(CertOrdersService.name);

  constructor(
    @InjectModel(CertOrder.name)
    private readonly model: Model<CertOrderDocument>,
    private readonly provider: ChungchiClient,
  ) {}

  /** Giá bán = giá gốc * hệ số, làm tròn lên. */
  sellPrice(cost: number, s: Pick<ShopSettings, 'priceMarkup' | 'priceRoundTo'>): number {
    return Math.ceil((cost * s.priceMarkup) / s.priceRoundTo) * s.priceRoundTo;
  }

  newCode(): string {
    let s = 'MC';
    for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    return s;
  }

  /** Khách để trống lúc đặt mua thì dùng mật khẩu mặc định này cho dễ nhớ. */
  newP12Password(): string {
    return '1';
  }

  /** Thông tin thanh toán chuyển khoản (VietQR) cho một đơn. */
  payment(order: { price: number; code: string }, s: ShopSettings) {
    const id = s.bankId;
    const no = s.bankAccountNo;
    const name = s.bankAccountName;
    return {
      bankId: id,
      accountNo: no,
      accountName: name,
      amount: order.price,
      content: order.code,
      qrUrl: no
        ? `https://img.vietqr.io/image/${id}-${no}-compact2.png?amount=${order.price}` +
          `&addInfo=${encodeURIComponent(order.code)}&accountName=${encodeURIComponent(name)}`
        : '',
    };
  }

  /**
   * Đã nhận tiền → gửi đơn sang nhà cung cấp. Idempotent: chuyển trạng thái nguyên tử
   * để không gọi nhà cung cấp (trừ ví) hai lần.
   */
  async fulfill(orderId: string) {
    const order = await this.model.findOneAndUpdate(
      {
        _id: orderId,
        status: {
          $in: [
            CertOrderStatus.AwaitingPayment,
            CertOrderStatus.Paid,
          ],
        },
        providerOrderCode: { $in: [null, ''] },
      },
      { status: CertOrderStatus.Provisioning, paidAt: new Date(), error: '' },
      { new: true },
    );
    if (!order) return this.model.findById(orderId);

    try {
      // Gửi lại sau lỗi mơ hồ (vd timeout) có thể thực ra đã tạo đơn bên nhà cung cấp lần trước —
      // họ không hỗ trợ idempotency key nên không thể báo trước, chỉ có thể TỰ KIỂM lại bằng cách
      // tra lịch sử đơn theo UDID trước khi gọi tạo đơn mới, tránh trừ ví/tạo đơn thật lần 2.
      if (order.providerAttempts > 0) {
        const createdAt = (order as unknown as { createdAt: Date }).createdAt;
        let history: ProviderOrder[];
        try {
          history = await this.provider.ordersByUdid(order.udid);
        } catch (e) {
          // QUAN TRỌNG: không kiểm tra được thì KHÔNG được coi như "chắc chắn chưa có đơn" rồi tạo
          // mới — nếu đơn thật đã tồn tại (vd lần trước timeout sau khi họ đã tạo xong), tạo thêm sẽ
          // tính tiền 2 lần. Dừng hẳn ở đây, không rơi xuống nhánh tạo đơn mới bên dưới.
          this.log.warn(
            `Không tra được lịch sử đơn UDID ${order.udid} (đơn ${order.code}) để chống trùng: ${e instanceof Error ? e.message : e}`,
          );
          order.status = CertOrderStatus.Paid;
          order.error = 'Không kiểm tra được đơn trùng bên nhà cung cấp (lỗi kết nối), vui lòng thử gửi lại sau ít phút';
          await order.save();
          return order;
        }
        const existing = history
          .filter((o) => String(o.plan_id) === String(order.planId) && (!o.created_at || new Date(o.created_at) >= createdAt))
          .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
        if (existing) {
          order.providerOrderCode = existing.order_code;
          this.apply(order, existing);
          await order.save();
          return order;
        }
      }

      order.providerAttempts += 1;
      const po = await this.provider.createOrder({
        plan_id: order.planId,
        udid: order.udid,
        device: order.device,
        p12_password: order.p12Password,
      });
      order.providerOrderCode = po.order_code;
      this.apply(order, po);
    } catch (e) {
      // Chưa tạo được đơn bên nhà cung cấp: giữ "paid" để admin bấm gửi lại. Log đầy đủ vì trước đây
      // lỗi bị nuốt hoàn toàn (không in gì) nên không debug được khi khách báo "Lỗi không xác định".
      this.log.error(
        `Gửi đơn ${order.code} sang nhà cung cấp lỗi: ${e instanceof Error ? (e.stack ?? e.message) : e}`,
      );
      order.status = CertOrderStatus.Paid;
      order.error =
        e instanceof ProviderError
          ? `${e.code}: ${e.message}`
          : 'Lỗi không xác định';
    }
    await order.save();
    return order;
  }

  /** Đồng bộ trạng thái đơn từ nhà cung cấp (webhook + polling dự phòng). */
  async syncFromProvider(providerOrderCode: string) {
    const order = await this.model.findOne({ providerOrderCode });
    if (!order) return null;
    this.apply(order, await this.provider.getOrder(providerOrderCode));
    await order.save();
    return order;
  }

  private apply(order: CertOrderDocument, po: ProviderOrder) {
    if (po.status === 'completed') {
      order.status = CertOrderStatus.Completed;
      if (po.download_url) order.downloadUrl = po.download_url;
      order.error = '';
    } else if (po.status === 'failed') {
      order.status = CertOrderStatus.Failed;
    } else if (po.status === 'cancelled') {
      order.status = CertOrderStatus.Cancelled;
    } else {
      order.status = CertOrderStatus.Provisioning;
    }
  }
}
