import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from '../../common/counter.service';
import { Lead, LeadDocument } from './schemas/lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';

const COUNTER = 'leads';

@Injectable()
export class LeadsService {
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
      createdAt: new Date().toISOString(),
    });
  }
}
