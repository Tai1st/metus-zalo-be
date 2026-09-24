import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { SchedulesService } from './schedules.service';
import { MarkRanDto, ScheduleInputDto, UpdateScheduleDto } from './dto/schedule-input.dto';

@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/schedules')
export class SchedulesInternalController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list() {
    return this.schedules.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.schedules.get(id);
  }

  @Post()
  create(@Body() dto: ScheduleInputDto) {
    return this.schedules.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateScheduleDto) {
    return this.schedules.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.schedules.remove(id).then(() => ({ removed: id }));
  }

  @Patch(':id/ran')
  markRan(@Param('id', ParseIntPipe) id: number, @Body() dto: MarkRanDto) {
    return this.schedules
      .markRan(id, dto.nextRun ?? null)
      .then(() => ({ ok: true }));
  }
}
