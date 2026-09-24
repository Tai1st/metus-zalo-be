import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

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
}
