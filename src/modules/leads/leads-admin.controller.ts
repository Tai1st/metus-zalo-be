import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LeadsService } from './leads.service';

/** Admin queue of trial requests waiting for approval (auto-deleted after 48h). */
@ApiTags('leads')
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list() {
    return this.leads.listPending();
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.leads.approve(id);
  }

  @Delete(':id')
  async reject(@Param('id') id: string) {
    await this.leads.reject(id);
    return { removed: id };
  }
}
