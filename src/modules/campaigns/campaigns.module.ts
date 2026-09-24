import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../../common/counter.schema';
import { CounterService } from '../../common/counter.service';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { CampaignLog, CampaignLogSchema } from './schemas/campaign-log.schema';
import { CampaignsService } from './campaigns.service';
import { CampaignsInternalController } from './campaigns-internal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Counter.name, schema: CounterSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignLog.name, schema: CampaignLogSchema },
    ]),
  ],
  controllers: [CampaignsInternalController],
  providers: [CounterService, CampaignsService],
})
export class CampaignsModule {}
