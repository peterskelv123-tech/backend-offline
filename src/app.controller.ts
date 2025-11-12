import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './commonServices/Redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test-redis')
  async testRedis() {
    await this.redis.setAttendance('testStudent', { test: true });

    const snapshot = await this.redis.getAttendanceSnapshot();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return snapshot;
  }
}
