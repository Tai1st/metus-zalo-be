import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BinanceClient } from './binance.client';
import { CertWalletService } from './cert-wallet.service';
import { CertDeposit, CertDepositDocument, CertDepositStatus } from './schemas/cert-deposit.schema';

const POLL_MS = 20_000;
/** Cửa sổ nhìn lại Binance: đủ rộng hơn TTL 10 phút của đơn nạp để bắt được khoản chuyển muộn. */
const LOOKBACK_MS = 3 * 60 * 60 * 1000;

/** Chuyển chuỗi thập phân Binance trả về (vd "20.050686") thành micro-USDT nguyên, không qua số thực. */
function toMicro(amountStr: string): number {
  const [intPart, fracPart = ''] = amountStr.split('.');
  const frac6 = (fracPart + '000000').slice(0, 6);
  return Number(intPart) * 1_000_000 + Number(frac6 || '0');
}

/**
 * Đối soát nạp USDT (MVP, chỉ BEP20/BSC): poll lịch sử nạp Binance, khớp theo network+address+số
 * tiền chính xác (đã cấp riêng, không trùng) với đơn đang chờ, rồi cộng ví. Chỉ gọi Binance khi có
 * đơn đang chờ — không tốn request lúc không ai nạp.
 */
@Injectable()
export class CertDepositWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CertDepositWatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectModel(CertDeposit.name) private readonly depositModel: Model<CertDepositDocument>,
    private readonly binance: BinanceClient,
    private readonly wallet: CertWalletService,
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
      await this.wallet.expireOverdue();
      await this.checkOnce();
    } catch (e) {
      this.log.warn(`Lỗi đối soát nạp USDT: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  private async checkOnce() {
    const pending = await this.depositModel.find({
      status: { $in: [CertDepositStatus.Pending, CertDepositStatus.Expired] },
      createdAt: { $gte: new Date(Date.now() - LOOKBACK_MS) },
    });
    if (!pending.length) return;

    const records = await this.binance.depositHistory({ startTime: Date.now() - LOOKBACK_MS });
    for (const dep of pending) {
      const match = records.find(
        (r) =>
          r.status === 1 &&
          r.network === dep.network &&
          r.address.toLowerCase() === dep.address.toLowerCase() &&
          toMicro(r.amount) === dep.expectedAmountMicro,
      );
      if (!match) continue;
      const ok = await this.wallet.credit(dep, match.id, match.txId);
      if (ok) this.log.log(`Khớp nạp USDT: đơn ${dep._id}, giao dịch Binance ${match.id}`);
    }
  }
}
