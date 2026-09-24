import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { CampaignsService } from './campaigns.service';
import {
  CampaignStatusDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign-input.dto';
import { AddLogDto, BumpCountersDto } from './dto/add-log.dto';

@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/campaigns')
export class CampaignsInternalController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.campaigns.get(id);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaigns.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CampaignStatusDto,
  ) {
    return this.campaigns
      .updateStatus(id, dto.status)
      .then(() => ({ ok: true }));
  }

  @Post(':id/reset')
  resetProgress(@Param('id', ParseIntPipe) id: number) {
    return this.campaigns.resetProgress(id).then(() => ({ ok: true }));
  }

  @Patch(':id/counters')
  bumpCounters(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BumpCountersDto,
  ) {
    return this.campaigns.bumpCounters(id, dto.ok).then(() => ({ ok: true }));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.campaigns.remove(id).then(() => ({ removed: id }));
  }

  @Post(':id/logs')
  addLog(@Param('id', ParseIntPipe) id: number, @Body() dto: AddLogDto) {
    return this.campaigns.addLog(id, dto).then(() => ({ ok: true }));
  }

  @Get(':id/logs')
  listLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.campaigns.listLogs(id, Number(limit) || 200);
  }

  @Get(':id/logs/targets')
  targetsWithOutcome(
    @Param('id', ParseIntPipe) id: number,
    @Query('ok') ok: string,
  ) {
    return this.campaigns.targetsWithOutcome(id, ok === 'true');
  }

  @Get(':id/logs/count-since')
  countSentSince(
    @Param('id', ParseIntPipe) id: number,
    @Query('since') since: string,
  ) {
    return this.campaigns
      .countSentSince(id, since)
      .then((count) => ({ count }));
  }
}
