import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';

const COUNTER = 'leads';

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
  ) {}

  async create(dto: CreateLeadDto): Promise<void> {
    const seq = await this.counters.next(COUNTER);
    await this.model.create({
      seq,
      fullName: dto.fullName,
      phone: dto.phone,
      scale: dto.scale,
      referrer: dto.referrer?.trim() ?? '',
      createdAt: new Date().toISOString(),
    });
    void this.notifyTelegram(seq, dto);
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
