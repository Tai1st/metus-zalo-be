import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ConfirmLinkOrderDto, CreateLinkOrderDto } from './dto/link-order.dto';
import { LinkOrdersService } from './link-orders.service';

/** Đơn mua gói link. Người dùng tạo/xem/hủy đơn của mình; admin xác nhận đã nhận tiền. */
@ApiTags('link-orders')
@ApiBearerAuth()
@Roles(Role.Admin, Role.User)
@Controller('link-orders')
export class LinkOrdersController {
  constructor(private readonly orders: LinkOrdersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLinkOrderDto,
  ): Promise<Record<string, unknown>> {
    return this.orders.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.orders.list(user, status);
  }

  @Get(':code')
  get(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ): Promise<Record<string, unknown>> {
    return this.orders.get(user, code.toUpperCase());
  }

  @Post(':code/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.orders.cancel(user, code.toUpperCase());
  }

  /** Admin xác nhận đã nhận tiền -> kích hoạt gói cho người mua. */
  @Roles(Role.Admin)
  @Post(':code/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: ConfirmLinkOrderDto,
  ) {
    return this.orders.markPaid(code.toUpperCase(), `admin:${user.id}`, {
      txRef: dto.txRef,
    });
  }
}
