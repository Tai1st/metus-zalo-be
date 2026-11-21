import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CertSettingsService } from '../cert-shop/cert-settings.service';
import { LinkOrder, LinkOrderDocument } from './schemas/link-order.schema';
import { LinkOrdersService } from './link-orders.service';

interface Web2mTransaction {
  transactionNumber: string;
  amount: number;
  description: string;
  type: 'IN' | 'OUT';
}

const POLL_MS = 30_000;

/**
 * Tự động xác nhận đơn mua gói link: đọc lịch sử giao dịch ACB qua web2m.com (cùng token và cùng
 * tài khoản nhận tiền với shop chứng chỉ), khớp mã đơn nằm trong nội dung chuyển khoản VÀ đúng
 * số tiền. Tài khoản dùng chung nhiều sản phẩm nên không khớp mơ hồ theo số tiền hay nội dung riêng lẻ.
 * Chỉ gọi web2m khi đang có đơn chờ thanh toán.
 */
@Injectable()
export class LinkPaymentWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LinkPaymentWatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly settings: CertSettingsService,
    private readonly orders: LinkOrdersService,
    @InjectModel(LinkOrder.name) private readonly model: Model<LinkOrderDocument>,
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
    const pending = await this.model.find({ status: 'pending' });
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
        (t) => t.amount === order.amount && t.description.toUpperCase().includes(code),
      );
      if (!match) continue;
      this.log.log(`Khớp thanh toán đơn ${order.code}: giao dịch #${match.transactionNumber}, ${match.amount}đ`);
      try {
        await this.orders.markPaid(order.code, 'web2m', {
          amount: match.amount,
          txRef: match.transactionNumber,
        });
      } catch (e) {
        this.log.warn(`Không kích hoạt được đơn ${order.code}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
