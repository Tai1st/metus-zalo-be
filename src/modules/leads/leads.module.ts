import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../../common/counter.schema';
import { CounterService } from '../../common/counter.service';
import { Lead, LeadSchema } from './schemas/lead.schema';
import { LeadsService } from './leads.service';
import { LeadsInternalController } from './leads-internal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Counter.name, schema: CounterSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  controllers: [LeadsInternalController],
  providers: [CounterService, LeadsService],
})
export class LeadsModule {}
