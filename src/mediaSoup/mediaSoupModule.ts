import { Module } from '@nestjs/common';
import { MediasoupService } from './mediaSoupService';

@Module({
  providers: [MediasoupService],
  exports: [MediasoupService],
})
export class MediasoupModule {}
