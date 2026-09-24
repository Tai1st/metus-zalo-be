import {
  Body,
  Controller,
  Delete,
  Get,
  ConflictException,
  NotFoundException,
  Param,
  HttpCode,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UsersService } from './users.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ResetEmployeePasswordDto } from './dto/reset-employee-password.dto';
import { SetActiveDto } from './dto/set-active.dto';

/**
 * "Quản lý người dùng web" — admin view of customer accounts (role `user`,
 * i.e. people who log in to buy/use plans). Separate from `UsersController`
 * (`/users`), which only ever lists Staff/nhân sự accounts — different
 * concept, kept on its own path so the two never get confused.
 */
@ApiTags('customers')
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('admin/customers')
export class CustomersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list() {
    const rows = await this.users.listCustomers();
    return rows.map((r) => r.toJSON());
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const user = await this.users.getCustomer(id);
    if (!user) throw new NotFoundException('Không tìm thấy khách hàng');
    return user.toJSON();
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    const user = await this.users.getCustomer(id);
    if (!user) throw new NotFoundException('Không tìm thấy khách hàng');
    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim();
    return (await user.save()).toJSON();
  }

  @Post()
  async create(@Body() dto: CreateCustomerDto) {
    if (await this.users.findByUsername(dto.username)) {
      throw new ConflictException('Tên đăng nhập đã được sử dụng');
    }
    return (await this.users.create({ ...dto, role: Role.User })).toJSON();
  }

  @HttpCode(200)
  @Patch(':id/password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetEmployeePasswordDto,
  ) {
    const user = await this.users.getCustomer(id);
    if (!user) throw new NotFoundException('Không tìm thấy khách hàng');
    await this.users.setPassword(id, dto.newPassword);
    return { ok: true };
  }

  @Patch(':id/active')
  async setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    const user = await this.users.setCustomerActive(id, dto.isActive);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user.toJSON();
  }

  /** Xoá khách hàng và toàn bộ dữ liệu liên quan: nhân sự, tài khoản Zalo,
   * chiến dịch/lịch trình, lịch sử chat, lời mời kết bạn, proxy, đăng ký. */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const removed = await this.users.deleteCustomerCascade(id);
    if (!removed) throw new NotFoundException('Không tìm thấy khách hàng');
    return { removed: id };
  }
}
