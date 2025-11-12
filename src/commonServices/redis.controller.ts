import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { RedisService } from './Redis.service';

@Controller('redis')
export class RedisController {
  constructor(private readonly redis: RedisService) {}

  @Get('exam-active-students')
  async getStudentsTakingExam(@Query('examId', ParseIntPipe) examId: number) {
    const students = await this.redis.getStudentsByExam(examId);

    return {
      count: students.length,
    };
  }
}
