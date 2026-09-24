import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/leads')
export class LeadsInternalController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto).then(() => ({ ok: true }));
  }
}
