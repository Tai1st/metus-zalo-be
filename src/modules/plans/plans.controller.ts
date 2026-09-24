import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Public price list: only plans that can currently be bought. */
  @Public()
  @Get()
  async list() {
    return (await this.plans.listActive()).map((p) => p.toJSON());
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Get('admin/all')
  async listAll() {
    return (await this.plans.listAll()).map((p) => p.toJSON());
  }

  @Public()
  @Get(':id')
  async get(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.plans.get(id)).toJSON();
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Post()
  async create(@Body() dto: CreatePlanDto) {
    return (await this.plans.create(dto)).toJSON();
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Patch(':id')
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return (await this.plans.update(id, dto)).toJSON();
  }

  /** Stops selling the plan (existing subscribers keep it). */
  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Delete(':id')
  async deactivate(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.plans.deactivate(id)).toJSON();
  }
}
