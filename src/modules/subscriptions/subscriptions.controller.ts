import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { UsersService } from '../users/users.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { SubscribeDto } from './dto/subscribe.dto';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

class GrantDto extends SubscribeDto {
  @IsMongoId()
  userId: string;
}

class AddSeatsDto {
  @IsMongoId({ message: 'Gói mua thêm không hợp lệ' })
  addonId: string;
}

class AdminUpdateDto {
  @IsOptional()
  @IsMongoId({ message: 'Gói cước không hợp lệ' })
  planId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Hạn dùng không hợp lệ' })
  expiresAt?: string;

  /** New billing period (3 / 6 / 12). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;

  /** Staff pack to apply (replaces any existing pack). */
  @IsOptional()
  @IsMongoId({ message: 'Gói mua thêm không hợp lệ' })
  addonId?: string;

  /** Total extra staff seats on top of the plan (0 removes them all). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  extraSeats?: number;
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly users: UsersService,
  ) {}

  @Post()
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return (await this.subs.subscribe(user.id, dto)).toJSON();
  }

  @Get('me')
  async mine(@CurrentUser() user: AuthUser) {
    return (await this.subs.mine(user.id)).map((s) => s.toJSON());
  }

  @Get('me/current')
  async current(@CurrentUser() user: AuthUser) {
    const sub = await this.subs.current(user.id);
    return { subscription: sub?.toJSON() ?? null };
  }

  @Patch('me/:id/cancel')
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return (await this.subs.cancel(user.id, id)).toJSON();
  }

  // ---- admin ----

  @Roles(Role.Admin)
  @Get()
  async listAll() {
    return (await this.subs.listAll()).map((s) => s.toJSON());
  }

  @Roles(Role.Admin)
  @Patch(':id/activate')
  async activate(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.subs.activate(id)).toJSON();
  }

  @Roles(Role.Admin)
  @Patch(':id/reject')
  async reject(@Param('id', ParseObjectIdPipe) id: string) {
    return (await this.subs.reject(id)).toJSON();
  }

  @Roles(Role.Admin)
  @Post('admin/grant')
  async grant(@Body() dto: GrantDto) {
    const { userId, ...rest } = dto;
    const customer = await this.users.getCustomer(userId);
    if (!customer) throw new NotFoundException('Không tìm thấy người dùng');
    return (await this.subs.grant(userId, rest)).toJSON();
  }

  @Roles(Role.Admin)
  @Post(':id/add-seats')
  async addSeats(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AddSeatsDto,
  ) {
    return (await this.subs.addSeats(id, dto.addonId)).toJSON();
  }

  @Roles(Role.Admin)
  @Patch(':id/admin')
  async adminUpdate(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminUpdateDto,
  ) {
    return (
      await this.subs.adminUpdate(id, {
        planId: dto.planId,
        extraSeats: dto.extraSeats,
        addonId: dto.addonId,
        months: dto.months,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      })
    ).toJSON();
  }
}
