import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ResetEmployeePasswordDto } from './dto/reset-employee-password.dto';

/**
 * "Quản lý truy cập" — a leader (a customer, role User) manages their own staff
 * accounts, limited by the seats of their active plan. Staff belong to the
 * customer that created them (`ownerId`) and nobody else can see or edit them.
 */
@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.User)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const rows = await this.users.list(me.id);
    return rows.map((r) => r.toJSON());
  }

  @Get('quota')
  async quota(@CurrentUser() me: AuthUser) {
    const [limit, used] = await Promise.all([
      this.users.staffLimit(me.id),
      this.users.countStaff(me.id),
    ]);
    return { limit, used };
  }

  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateEmployeeDto) {
    const [limit, used] = await Promise.all([
      this.users.staffLimit(me.id),
      this.users.countStaff(me.id),
    ]);
    if (limit <= 0) {
      throw new ForbiddenException(
        'Gói hiện tại không có nhân sự — hãy nâng cấp lên gói Business',
      );
    }
    if (used >= limit) {
      throw new ForbiddenException(
        'Đã dùng hết ' + limit + ' nhân sự của gói hiện tại',
      );
    }
    await this.users.assertZaloIdsOwned(me.id, dto.allowedZaloIds);
    if (await this.users.findByUsername(dto.username)) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }
    const user = await this.users.create({
      ...dto,
      role: Role.Staff,
      ownerId: me.id,
    });
    return user.toJSON();
  }

  @Patch(':id')
  async update(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    await this.users.assertZaloIdsOwned(me.id, dto.allowedZaloIds);
    const user = await this.users.update(id, me.id, dto);
    if (!user) throw new NotFoundException('Không tìm thấy nhân sự');
    return user.toJSON();
  }

  @HttpCode(200)
  @Patch(':id/password')
  async resetPassword(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetEmployeePasswordDto,
  ) {
    const user = await this.users.findStaffOf(id, me.id);
    if (!user) throw new NotFoundException('Không tìm thấy nhân sự');
    await this.users.setPassword(id, dto.newPassword);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const removed = await this.users.remove(id, me.id);
    if (!removed) throw new NotFoundException('Không tìm thấy nhân sự');
    return { removed: id };
  }
}
