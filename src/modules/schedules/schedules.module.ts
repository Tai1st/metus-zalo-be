import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../../common/counter.schema';
import { CounterService } from '../../common/counter.service';
import { Schedule, ScheduleSchema } from './schemas/schedule.schema';
import { SchedulesService } from './schedules.service';
import { SchedulesInternalController } from './schedules-internal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Counter.name, schema: CounterSchema },
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
  ],
  controllers: [SchedulesInternalController],
  providers: [CounterService, SchedulesService],
})
export class SchedulesModule {}
