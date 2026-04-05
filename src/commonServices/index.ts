import { Global, Module } from '@nestjs/common';
import { ResponseService } from './response.services';
import { DatabaseHealthService } from './database-health.service';
import { RedisService } from './Redis.service';
import { AttendanceGateway } from './gateways/attendance.gateway';
import { ExamModule } from 'src/examModule';
import { RedisController } from './redis.controller';
import { MediasoupService } from '../mediaSoup/mediaSoupService';
import { MediaGateway } from './gateways/media.gateway';
import { AttendanceService } from './AttendanceService';
@Global()
@Module({
  imports: [ExamModule],
  controllers: [RedisController],
  providers: [
    ResponseService,
    DatabaseHealthService,
    RedisService,
    MediasoupService,
    AttendanceService,
    AttendanceGateway,
    MediaGateway,
  ],
  exports: [
    ResponseService,
    DatabaseHealthService,
    RedisService,
    AttendanceService,
    AttendanceGateway,
    MediaGateway,
  ],
})
export class CommonModule {}
