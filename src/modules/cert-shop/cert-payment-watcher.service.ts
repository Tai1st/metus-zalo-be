import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CertSettingsService } from './cert-settings.service';
import { CertOrdersService } from './cert-orders.service';
import { CertOrder, CertOrderDocument, CertOrderStatus } from './schemas/cert-order.schema';

interface Web2mTransaction {
  transactionNumber: string;
  amount: number;
  description: string;
  type: 'IN' | 'OUT';
}

const POLL_MS = 30_000;

/**
 * Tự động xác nhận đơn "chờ thanh toán" bằng lịch sử giao dịch ACB (qua web2m.com), thay vì
 * đợi khách bấm xác nhận thủ công. Khớp theo đúng mã đơn (nội dung chuyển khoản) nằm trong mô tả
 * giao dịch VÀ số tiền khớp chính xác — tài khoản này dùng chung cho nhiều sản phẩm khác (vd Zalo),
 * nên không khớp mơ hồ theo số tiền hay nội dung một mình.
 */
@Injectable()
export class CertPaymentWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CertPaymentWatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly settings: CertSettingsService,
    private readonly orders: CertOrdersService,
    @InjectModel(CertOrder.name) private readonly model: Model<CertOrderDocument>,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkOnce();
    } catch (e) {
      this.log.warn(`Lỗi khi đồng bộ giao dịch: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  private async checkOnce() {
    const pending = await this.model.find({ status: CertOrderStatus.AwaitingPayment });
    if (!pending.length) return;

    const { web2mToken } = await this.settings.get();
    if (!web2mToken) return;

    const res = await fetch(`https://api.web2m.com/historyapiopenacb/${encodeURIComponent(web2mToken)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      this.log.warn(`web2m trả về lỗi HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as { success?: boolean; transactions?: Web2mTransaction[] };
    if (!json.success || !json.transactions) return;

    const incoming = json.transactions.filter((t) => t.type === 'IN');
    for (const order of pending) {
      const code = order.code.toUpperCase();
      const match = incoming.find(
        (t) => t.amount === order.price && t.description.toUpperCase().includes(code),
      );
      if (!match) continue;
      this.log.log(`Khớp thanh toán đơn ${order.code}: giao dịch #${match.transactionNumber}, ${match.amount}đ`);
      await this.orders.fulfill(String(order._id));
    }
  }
}
