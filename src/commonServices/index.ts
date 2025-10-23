import { Global, Module } from '@nestjs/common';
import { ResponseService } from './response.services';
import { DatabaseHealthService } from './database-health.service';
@Global()
@Module({
  providers: [ResponseService, DatabaseHealthService],
  exports: [ResponseService, DatabaseHealthService],
})
export class CommonModule {}
