import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConflictException } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UsersService } from './users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ResetEmployeePasswordDto } from './dto/reset-employee-password.dto';

/**
 * "Quản lý truy cập" — admin-only staff account management. Reached through
 * the same JWT bearer session as everything else (not the internal-key
 * boundary): the global JwtAuthGuard + RolesGuard already require an
 * authenticated admin before any handler here runs.
 */
@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list() {
    const rows = await this.users.list();
    return rows.map((r) => r.toJSON());
  }

  @Post()
  async create(@Body() dto: CreateEmployeeDto) {
    if (await this.users.findByUsername(dto.username)) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }
    const user = await this.users.create({ ...dto, role: Role.Staff });
    return user.toJSON();
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    const user = await this.users.update(id, dto);
    if (!user) throw new NotFoundException('Không tìm thấy nhân sự');
    return user.toJSON();
  }

  @HttpCode(200)
  @Patch(':id/password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetEmployeePasswordDto,
  ) {
    const user = await this.users.findById(id);
    if (!user || user.role !== Role.Staff) {
      throw new NotFoundException('Không tìm thấy nhân sự');
    }
    await this.users.setPassword(id, dto.newPassword);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const removed = await this.users.remove(id);
    if (!removed) throw new NotFoundException('Không tìm thấy nhân sự');
    return { removed: id };
  }
}
