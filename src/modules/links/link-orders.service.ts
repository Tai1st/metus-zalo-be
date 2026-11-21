import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import { LinkOrder, LinkOrderDocument } from './schemas/link-order.schema';
import { CreateLinkOrderDto } from './dto/link-order.dto';
import { LinkPlansService, FREE_PLAN_CODE } from './link-plans.service';
import { CertSettingsService } from '../cert-shop/cert-settings.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { priceFor } from '../../common/pricing';

const MAX_PENDING_PER_USER = 3;
// Bỏ các ký tự dễ nhầm (0/O, 1/I) vì mã này được gõ vào nội dung chuyển khoản.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newOrderCode(): string {
  let s = 'LK';
  for (const v of randomBytes(6)) s += CODE_ALPHABET[v % CODE_ALPHABET.length];
  return s;
}

@Injectable()
export class LinkOrdersService {
  constructor(
    @InjectModel(LinkOrder.name) private readonly model: Model<LinkOrderDocument>,
    private readonly plans: LinkPlansService,
    private readonly settings: CertSettingsService,
  ) {}

  /**
   * Thông tin để người dùng chuyển khoản. Dùng chung tài khoản nhận tiền với shop chứng chỉ
   * (cấu hình ở cert settings: bankId / bankAccountNo / bankAccountName).
   */
  async paymentInfo(o: Pick<LinkOrder, 'code' | 'amount'>) {
    const s = await this.settings.get();
    const qrUrl = s.bankAccountNo
      ? `https://img.vietqr.io/image/${encodeURIComponent(s.bankId)}-${encodeURIComponent(s.bankAccountNo)}-compact2.png` +
        `?amount=${o.amount}&addInfo=${encodeURIComponent(o.code)}&accountName=${encodeURIComponent(s.bankAccountName)}`
      : null;
    return {
      configured: !!s.bankAccountNo,
      bankId: s.bankId,
      accountNo: s.bankAccountNo,
      accountName: s.bankAccountName,
      amount: o.amount,
      content: o.code,
      qrUrl,
    };
  }

  async create(user: AuthUser, dto: CreateLinkOrderDto): Promise<Record<string, unknown>> {
    if (dto.planCode.toLowerCase() === FREE_PLAN_CODE) {
      throw new BadRequestException('Gói free không cần mua');
    }
    const plan = await this.plans.getByCode(dto.planCode);
    if (!plan || !plan.isActive) throw new NotFoundException('Gói không tồn tại hoặc đã ngừng bán');
    const amount = priceFor(plan.prices, dto.months);
    if (amount === undefined || amount <= 0) {
      throw new BadRequestException('Gói này không bán theo thời hạn đã chọn');
    }

    const pending = await this.model.countDocuments({ userId: user.id, status: 'pending' });
    if (pending >= MAX_PENDING_PER_USER) {
      throw new BadRequestException(
        `Bạn đang có ${pending} đơn chờ thanh toán, hãy thanh toán hoặc hủy bớt trước khi tạo đơn mới`,
      );
    }

    for (let i = 0; i < 5; i++) {
      try {
        const doc = await this.model.create({
          code: newOrderCode(),
          userId: user.id,
          planCode: plan.code,
          planName: plan.name,
          months: dto.months,
          amount,
          currency: plan.currency,
        });
        return { ...doc.toJSON(), payment: await this.paymentInfo(doc) };
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    }
    throw new BadRequestException('Không tạo được mã đơn, thử lại');
  }

  /** Admin xem tất cả đơn; người dùng chỉ xem đơn của mình. */
  async list(user: AuthUser, status?: string) {
    const filter: Record<string, unknown> = {};
    if (user.role !== Role.Admin) filter.userId = user.id;
    if (status === 'pending' || status === 'paid' || status === 'cancelled') {
      filter.status = status;
    }
    const docs = await this.model.find(filter).sort({ createdAt: -1 }).limit(200);
    return docs.map((d) => d.toJSON());
  }

  async get(user: AuthUser, code: string): Promise<Record<string, unknown>> {
    const doc = await this.model.findOne({ code });
    if (!doc) throw new NotFoundException('Không tìm thấy đơn');
    if (user.role !== Role.Admin && doc.userId !== user.id) {
      throw new ForbiddenException('Không có quyền xem đơn này');
    }
    return {
      ...doc.toJSON(),
      payment: doc.status === 'pending' ? await this.paymentInfo(doc) : null,
    };
  }

  async cancel(user: AuthUser, code: string) {
    const doc = await this.model.findOne({ code });
    if (!doc) throw new NotFoundException('Không tìm thấy đơn');
    if (user.role !== Role.Admin && doc.userId !== user.id) {
      throw new ForbiddenException('Không có quyền hủy đơn này');
    }
    const r = await this.model.findOneAndUpdate(
      { code, status: 'pending' },
      { status: 'cancelled' },
      { new: true },
    );
    if (!r) throw new BadRequestException('Chỉ hủy được đơn đang chờ thanh toán');
    return r.toJSON();
  }

  /**
   * Đánh dấu đã thanh toán rồi kích hoạt gói. Dùng chung cho admin xác nhận tay và cho webhook
   * ngân hàng sau này (truyền `amount` để đối chiếu số tiền). Chạy lại là vô hại: đơn đã paid thì
   * trả lại nguyên trạng, không cộng dồn thời hạn lần nữa.
   */
  async markPaid(code: string, by: string, opts: { amount?: number; txRef?: string } = {}) {
    const order = await this.model.findOne({ code });
    if (!order) throw new NotFoundException('Không tìm thấy đơn');
    if (order.status === 'paid') return order.toJSON();
    if (order.status !== 'pending') {
      throw new BadRequestException('Đơn đã bị hủy, không thể xác nhận');
    }
    if (opts.amount !== undefined && opts.amount < order.amount) {
      throw new BadRequestException(
        `Số tiền ${opts.amount} nhỏ hơn giá trị đơn ${order.amount}`,
      );
    }

    // Chuyển pending -> paid một lần duy nhất (chống hai lần xác nhận cùng lúc).
    const claimed = await this.model.findOneAndUpdate(
      { code, status: 'pending' },
      { status: 'paid', paidAt: new Date(), paidBy: by, txRef: opts.txRef ?? '' },
      { new: true },
    );
    if (!claimed) return (await this.model.findOne({ code }))!.toJSON();

    try {
      await this.plans.grant(claimed.userId, claimed.planCode, claimed.months);
    } catch (e) {
      // Kích hoạt lỗi thì trả đơn về chờ để xác nhận lại, tránh mất tiền mà không có gói.
      await this.model.updateOne(
        { code },
        { status: 'pending', paidAt: null, paidBy: '', txRef: '' },
      );
      throw e;
    }
    return claimed.toJSON();
  }
}
