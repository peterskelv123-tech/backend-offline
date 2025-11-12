import { Global, Module } from '@nestjs/common';
import { ResponseService } from './response.services';
import { DatabaseHealthService } from './database-health.service';
import { RedisService } from './Redis.service';
import { AttendanceGateway } from './gateways/attendance.gateway';
@Global()
@Module({
  providers: [
    ResponseService,
    DatabaseHealthService,
    RedisService,
    AttendanceGateway,
  ],
  exports: [
    ResponseService,
    DatabaseHealthService,
    RedisService,
    AttendanceGateway,
  ],
})
export class CommonModule {}
