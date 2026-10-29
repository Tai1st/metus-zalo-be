import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Model } from 'mongoose';
import { CertSettingsService, ShopSettings } from './cert-settings.service';
import { CertOrdersService } from './cert-orders.service';
import { CertDeposit, CertDepositDocument, CertDepositStatus } from './schemas/cert-deposit.schema';
import { CertWallet, CertWalletDocument } from './schemas/cert-wallet.schema';
import { CertWalletLedger, CertWalletLedgerDocument } from './schemas/cert-wallet-ledger.schema';

const DEPOSIT_TTL_MS = 10 * 60 * 1000;
/** Phần lẻ nhận diện: 1–999 micro-USDT (0.000001–0.000999 USDT), đủ hẹp để không đổi số tiền hiển thị nhiều. */
const MAX_ADJUSTMENT_MICRO = 999;
const RESERVE_RETRIES = 25;

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

/**
 * Ví của khách: nạp USDT qua Binance (BEP20, MVP) → quy đổi sang VND ngay lúc cộng (snapshot tỷ
 * giá) → dùng để mua gói chứng chỉ trực tiếp thay VietQR.
 */
@Injectable()
export class CertWalletService {
  private readonly log = new Logger(CertWalletService.name);

  constructor(
    @InjectModel(CertDeposit.name) private readonly depositModel: Model<CertDepositDocument>,
    @InjectModel(CertWallet.name) private readonly walletModel: Model<CertWalletDocument>,
    @InjectModel(CertWalletLedger.name) private readonly ledgerModel: Model<CertWalletLedgerDocument>,
    private readonly settings: CertSettingsService,
    private readonly orders: CertOrdersService,
  ) {}

  async balanceVnd(userId: string): Promise<number> {
    const w = await this.walletModel.findOne({ userId });
    return w?.balanceVnd ?? 0;
  }

  /** Mạng phải đã bật, có địa chỉ và mã Binance thật đã xác minh — không cho dùng mạng chưa cấu hình xong. */
  private resolveNetwork(s: ShopSettings, networkKey: string) {
    const net = s.usdtNetworks.find((n) => n.key === networkKey);
    if (!net || !net.enabled || !net.address || !net.binanceNetwork) {
      throw new BadRequestException('Mạng này chưa khả dụng, vui lòng chọn mạng khác');
    }
    return net;
  }

  /**
   * Tạo lượt nạp mới: cấp số tiền USDT riêng duy nhất vĩnh viễn (network+address+expectedAmount)
   * bằng CSPRNG, dựa vào unique index của DB làm hàng rào cuối chống trùng — không tự tin vào việc
   * sinh số ngẫu nhiên không đụng độ, mà thử tạo thật và bắt lỗi duplicate key để thử số khác.
   */
  async createDeposit(userId: string, requestedAmountMicro: number, networkKey: string): Promise<CertDepositDocument> {
    const s = await this.settings.get();
    const net = this.resolveNetwork(s, networkKey);
    if (requestedAmountMicro < s.depositMinMicro || requestedAmountMicro > s.depositMaxMicro) {
      throw new BadRequestException(
        `Số tiền phải từ ${s.depositMinMicro / 1e6} đến ${s.depositMaxMicro / 1e6} USDT`,
      );
    }
    const existing = await this.depositModel.findOne({
      userId,
      status: CertDepositStatus.Pending,
      expiresAt: { $gt: new Date() },
    });
    if (existing) throw new BadRequestException('Bạn đang có một lượt nạp chưa hoàn tất, vui lòng chờ hết hạn hoặc hoàn tất trước');

    return this.reserveDeposit({ userId, requestedAmountMicro, net });
  }

  /**
   * Thanh toán USDT trực tiếp cho một đơn (không qua ví): tìm-hoặc-tạo lượt chuyển gắn với orderCode.
   * Cùng công thức/cơ chế chống trùng như createDeposit(), chỉ khác requestedAmountMicro lấy từ giá
   * đơn (quy đổi theo tỷ giá hiện tại) thay vì khách tự nhập. Phí dịch vụ áp như nạp ví, không miễn.
   * Gọi lại khi lượt trước hết hạn sẽ tự cấp một lượt mới (không cần endpoint "tạo lại" riêng).
   */
  async orderPayment(
    order: { _id: unknown; code: string; price: number; userId: string },
    networkKey: string,
  ): Promise<CertDepositDocument> {
    const existing = await this.depositModel.findOne({
      orderCode: order.code,
      status: CertDepositStatus.Pending,
      expiresAt: { $gt: new Date() },
    });
    if (existing) return existing;

    const s = await this.settings.get();
    const net = this.resolveNetwork(s, networkKey);
    const requestedAmountMicro = Math.round((order.price / s.usdtVndRate) * 1e6);

    return this.reserveDeposit({
      userId: order.userId,
      requestedAmountMicro,
      net,
      orderId: String(order._id),
      orderCode: order.code,
    });
  }

  private async reserveDeposit(opts: {
    userId: string;
    requestedAmountMicro: number;
    net: ShopSettings['usdtNetworks'][number];
    orderId?: string;
    orderCode?: string;
  }): Promise<CertDepositDocument> {
    const { userId, requestedAmountMicro, net, orderId, orderCode } = opts;
    const serviceFeeMicro = net.feeMicro;
    for (let i = 0; i < RESERVE_RETRIES; i++) {
      const adjustmentMicro = randomInt(1, MAX_ADJUSTMENT_MICRO + 1);
      const expectedAmountMicro = requestedAmountMicro + serviceFeeMicro + adjustmentMicro;
      try {
        return await this.depositModel.create({
          userId,
          ...(orderId && { orderId, orderCode }),
          network: net.binanceNetwork,
          networkLabel: net.label,
          address: net.address,
          requestedAmountMicro,
          serviceFeeMicro,
          adjustmentMicro,
          expectedAmountMicro,
          creditAmountMicro: expectedAmountMicro - serviceFeeMicro,
          status: CertDepositStatus.Pending,
          expiresAt: new Date(Date.now() + DEPOSIT_TTL_MS),
        });
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
    }
    throw new BadRequestException('Không thể cấp số tiền riêng lúc này, vui lòng thử lại sau ít phút');
  }

  /** Lượt USDT gần nhất gắn với một đơn (để trang chi tiết đơn hiện lại QR/trạng thái khi load lại). */
  async findOrderDeposit(orderCode: string): Promise<CertDepositDocument | null> {
    return this.depositModel.findOne({ orderCode }).sort({ createdAt: -1 });
  }

  async get(userId: string, id: string): Promise<CertDepositDocument | null> {
    return this.depositModel.findOne({ _id: id, userId });
  }

  async history(userId: string, limit = 20): Promise<CertDepositDocument[]> {
    return this.depositModel.find({ userId }).sort({ createdAt: -1 }).limit(limit);
  }

  async cancel(userId: string, id: string): Promise<void> {
    await this.depositModel.updateOne(
      { _id: id, userId, status: CertDepositStatus.Pending },
      { status: CertDepositStatus.Cancelled },
    );
  }

  /** Hết hạn hiển thị cho khách nhưng vẫn tiếp tục đối soát sau đó — chỉ đổi nhãn trạng thái. */
  async expireOverdue(): Promise<void> {
    await this.depositModel.updateMany(
      { status: CertDepositStatus.Pending, expiresAt: { $lt: new Date() } },
      { status: CertDepositStatus.Expired },
    );
  }

  /**
   * Cộng tiền nguyên tử: gate bằng chuyển trạng thái đơn (chỉ 1 lần pending/expired→credited),
   * rồi ghi ledger với idempotencyKey duy nhất theo providerDepositId — hai lớp chặn trùng độc lập,
   * worker chạy chồng hoặc gọi lại không bao giờ cộng 2 lần. Không dùng Mongo transaction (hạ tầng
   * chia sẻ có thể không phải replica set) — pattern này đã dùng ổn định cho toàn bộ module cert-shop.
   * Tỷ giá USDT→VND snapshot tại đúng thời điểm này, lưu lại trên đơn để không đổi về sau.
   */
  async credit(deposit: CertDepositDocument, providerDepositId: string, txId: string): Promise<boolean> {
    const rate = (await this.settings.get()).usdtVndRate;
    const creditedVnd = Math.round((deposit.creditAmountMicro / 1e6) * rate);

    const claimed = await this.depositModel.findOneAndUpdate(
      { _id: deposit._id, status: { $in: [CertDepositStatus.Pending, CertDepositStatus.Expired] } },
      { status: CertDepositStatus.Credited, creditedAt: new Date(), providerDepositId, txId, creditedVndRate: rate, creditedVnd },
    );
    if (!claimed) return false;

    // Trả trực tiếp cho đơn: không cộng ví/ghi ledger, chỉ gửi đơn sang nhà cung cấp. fulfill() đã
    // tự atomic/idempotent (claim-gate theo trạng thái đơn) nên gọi lại không fulfill 2 lần.
    if (deposit.orderId) {
      await this.orders.fulfill(deposit.orderId);
      this.log.log(`Đơn ${deposit.orderCode} đã nhận đủ USDT, đã gửi fulfill (nạp ${deposit._id})`);
      return true;
    }

    const idempotencyKey = `binance-deposit:${providerDepositId}`;
    try {
      await this.ledgerModel.create({
        userId: deposit.userId,
        amountVnd: creditedVnd,
        kind: 'deposit',
        depositId: String(deposit._id),
        idempotencyKey,
      });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      this.log.warn(`Ledger đã có sẵn cho ${idempotencyKey}, bỏ qua cộng lại`);
      return true;
    }
    await this.walletModel.updateOne(
      { userId: deposit.userId },
      { $inc: { balanceVnd: creditedVnd }, $setOnInsert: { userId: deposit.userId } },
      { upsert: true },
    );
    this.log.log(`Đã cộng ${creditedVnd}đ (${deposit.creditAmountMicro / 1e6} USDT) cho user ${deposit.userId} (nạp ${deposit._id})`);
    return true;
  }

  /**
   * Trừ ví để trả cho một đơn chứng chỉ (VND, khớp thẳng order.price). idempotencyKey theo mã đơn
   * nên gọi lại không trừ 2 lần. Trả false nếu số dư không đủ (và không trừ gì cả).
   */
  async spend(userId: string, amountVnd: number, orderCode: string): Promise<boolean> {
    const idempotencyKey = `cert-order:${orderCode}`;
    try {
      await this.ledgerModel.create({ userId, amountVnd: -amountVnd, kind: 'spend', orderCode, idempotencyKey });
    } catch (e) {
      if (isDuplicateKey(e)) return true; // đã trừ ở lần gọi trước
      throw e;
    }
    const r = await this.walletModel.updateOne(
      { userId, balanceVnd: { $gte: amountVnd } },
      { $inc: { balanceVnd: -amountVnd } },
    );
    if (!r.modifiedCount) {
      await this.ledgerModel.deleteOne({ idempotencyKey });
      return false;
    }
    return true;
  }
}
