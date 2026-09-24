import { randomInt } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Role } from '../../common/enums/role.enum';

const COUNTER = 'leads';
const PENDING_MS = 48 * 60 * 60 * 1000;
const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const SCALE_LABEL: Record<string, string> = {
  personal: 'Cá nhân / Freelancer',
  small: 'Shop nhỏ (2–3 nhân sự)',
  medium: 'Doanh nghiệp vừa (4–10 nhân sự)',
  large: 'Doanh nghiệp lớn (trên 10 nhân sự)',
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

@Injectable()
export class LeadsService {
  private readonly log = new Logger(LeadsService.name);

  constructor(
    @InjectModel(Lead.name) private readonly model: Model<LeadDocument>,
    private readonly counters: CounterService,
    private readonly users: UsersService,
    private readonly plans: PlansService,
    private readonly subs: SubscriptionsService,
  ) {}

  async create(dto: CreateLeadDto): Promise<void> {
    // The phone number is the login name: a number that already has an account
    // cannot ask for a trial again.
    if (await this.users.findByUsername(dto.phone)) {
      throw new ConflictException(
        'Số điện thoại này đã có tài khoản. Vui lòng đăng nhập hoặc liên hệ hỗ trợ qua Zalo.',
      );
    }
    // Same phone already waiting: keep one request, just refresh its details.
    const waiting = await this.model.findOne({
      phone: dto.phone,
      status: 'pending',
      expireAt: { $gt: new Date() },
    });
    if (waiting) {
      waiting.fullName = dto.fullName;
      waiting.scale = dto.scale;
      waiting.referrer = dto.referrer?.trim() || waiting.referrer;
      await waiting.save();
      return;
    }
    const seq = await this.counters.next(COUNTER);
    await this.model.create({
      seq,
      fullName: dto.fullName,
      phone: dto.phone,
      scale: dto.scale,
      referrer: dto.referrer?.trim() ?? '',
      createdAt: new Date().toISOString(),
      status: 'pending',
      expireAt: new Date(Date.now() + PENDING_MS),
    });
    void this.notifyTelegram(seq, dto);
  }

  /** Requests still waiting (the TTL index can lag up to a minute, so filter too). */
  async listPending() {
    const rows = await this.model
      .find({ status: 'pending', expireAt: { $gt: new Date() } })
      .sort({ seq: -1 });
    return rows.map((r) => ({
      id: String(r._id),
      seq: r.seq,
      fullName: r.fullName,
      phone: r.phone,
      scale: r.scale,
      referrer: r.referrer ?? '',
      createdAt: r.createdAt,
      expireAt: r.expireAt,
    }));
  }

  /** Create the customer account (username = phone) + a 30-day Trial, then take the request off the queue. */
  async approve(id: string) {
    const lead = await this.model.findOne({
      _id: id,
      status: 'pending',
      expireAt: { $gt: new Date() },
    });
    if (!lead) throw new NotFoundException('Yêu cầu không còn tồn tại hoặc đã hết hạn');

    const login = lead.phone.replace(/\D/g, '').replace(/^84/, '0');
    if (await this.users.findByUsername(login)) {
      throw new ConflictException('Tên đăng nhập ' + login + ' đã được sử dụng');
    }
    const password = Array.from({ length: 10 }, () => PW_CHARS[randomInt(PW_CHARS.length)]).join('');
    const trial = await this.plans.getByCode('trial');
    const user = await this.users.create({
      username: login,
      password,
      fullName: lead.fullName,
      phone: lead.phone,
      role: Role.User,
    });
    try {
      await this.subs.grant(String(user._id), {
        planId: String(trial._id),
        months: 1,
      });
    } catch (e) {
      await user.deleteOne();
      throw e;
    }
    await this.model.updateOne(
      { _id: lead._id },
      {
        status: 'approved',
        approvedUserId: String(user._id),
        approvedAt: new Date(),
        $unset: { expireAt: 1 },
      },
    );
    return { username: login, password };
  }

  async reject(id: string) {
    const r = await this.model.deleteOne({ _id: id, status: 'pending' });
    if (r.deletedCount === 0) throw new NotFoundException('Không tìm thấy yêu cầu');
  }

  /** Best-effort: a Telegram failure must never fail the lead itself. */
  private async notifyTelegram(seq: number, dto: CreateLeadDto) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;
    const text = [
      '🆕 <b>Yêu cầu dùng thử Metus Zalo</b> #' + seq,
      'Họ tên: ' + escapeHtml(dto.fullName),
      'SĐT: ' + escapeHtml(dto.phone),
      'Quy mô: ' + escapeHtml(SCALE_LABEL[dto.scale] ?? dto.scale),
      'Người giới thiệu: ' + escapeHtml(dto.referrer?.trim() || 'Không có'),
    ].join('\n');
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) this.log.warn(`Telegram trả về ${res.status}`);
    } catch (e) {
      this.log.warn(`Không gửi được Telegram: ${(e as Error).message}`);
    }
  }
}
