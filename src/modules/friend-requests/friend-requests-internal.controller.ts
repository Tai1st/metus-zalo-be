import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { InternalKeyGuard } from '../../common/internal-key.guard';
import { FriendRequestsService } from './friend-requests.service';
import {
  CreateFriendRequestDto,
  UpdateFriendRequestStatusDto,
} from './dto/friend-request.dto';

@Public()
@UseGuards(InternalKeyGuard)
@Controller('internal/friend-requests')
export class FriendRequestsInternalController {
  constructor(private readonly requests: FriendRequestsService) {}

  @Get()
  list(@Query('accountId') accountId?: string) {
    return this.requests.list(accountId);
  }

  @Post()
  record(@Body() dto: CreateFriendRequestDto) {
    return this.requests.record(dto).then(() => ({ ok: true }));
  }

  @Patch(':id')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFriendRequestStatusDto,
  ) {
    return this.requests
      .setStatus(Number(id), dto.status)
      .then(() => ({ ok: true }));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.requests.remove(Number(id)).then(() => ({ removed: Number(id) }));
  }
}
