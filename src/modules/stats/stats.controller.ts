import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('admin/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  overview() {
    return this.stats.overview();
  }
}
