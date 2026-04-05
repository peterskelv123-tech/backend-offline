import { MediasoupService } from 'src/mediaSoup/mediaSoupService';
import { RedisService } from './Redis.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AttendanceService {
  constructor(
    private redis: RedisService,
    private mediaSoup: MediasoupService,
  ) {}

  async buildEnrichedSnapshot() {
    const snapshot = (await this.redis.getAttendanceSnapshot()).filter(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (it) => it.active,
    );

    const updatedProducers = this.mediaSoup.getAllProducers();
    //console.log('🔥 ALL PRODUCERS:', updatedProducers);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const mergedsnapshot = snapshot.map((student) => {
      const studentProducers = updatedProducers.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (p) => p.studentId === student.studentId,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      //console.log('👀 Matching for:', student.studentId, studentProducers);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        ...student,
        producers: {
          video: studentProducers.find((p) => p.kind === 'video')?.producerId,
          audio: studentProducers.find((p) => p.kind === 'audio')?.producerId,
        },
      };
    });
    //console.log('🔥 Enriched snapshot:', mergedsnapshot);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return mergedsnapshot;
  }
}
