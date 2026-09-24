import { Module } from '@nestjs/common';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { ZaloSessionService } from './zalo-session.service';
import { InternalKeyGuard } from '../common/internal-key.guard';

@Module({
  controllers: [GroupController],
  providers: [GroupService, ZaloSessionService, InternalKeyGuard],
})
export class GroupModule {}
