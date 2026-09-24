import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection } from 'mongoose';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly db: Connection) {}

  /** For load balancers / uptime checks: 200 only when MongoDB is reachable. */
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    if (this.db.readyState !== 1) {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up', uptime: Math.round(process.uptime()) };
  }
}
