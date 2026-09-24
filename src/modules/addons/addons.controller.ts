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
import { AddonsService } from './addons.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('addons')
@Controller('addons')
export class AddonsController {
  constructor(private readonly addons: AddonsService) {}

  @Public()
  @Get()
  async list() {
    return (await this.addons.listActive()).map((a) => a.toJSON());
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Get('admin/all')
  async listAll() {
    return (await this.addons.listAll()).map((a) => a.toJSON());
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Post()
  async create(@Body() dto: CreateAddonDto) {
    return (await this.addons.create(dto)).toJSON();
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Patch(':id')
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAddonDto,
  ) {
    return (await this.addons.update(id, dto)).toJSON();
  }

  @ApiBearerAuth()
  @Roles(Role.Admin)
  @Delete(':id')
  async deactivate(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.addons.deactivate(id)).toJSON();
  }
}
