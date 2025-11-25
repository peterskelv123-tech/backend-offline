import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { RedisService } from './Redis.service';
import { ResponseService } from './response.services';
import { UpdateStudentProgressDto } from 'src/DTO/update_student_progress_dto';

@Controller('redis')
export class RedisController {
  constructor(
    private readonly redis: RedisService,
    private readonly response: ResponseService,
  ) {}

  // -------------------------------
  // 1. Active Students for Exam
  // -------------------------------
  // @Get('exam-active-students')
  // async getStudentsTakingExam(@Query('examId', ParseIntPipe) examId: number) {
  //   try {
  //     const students = await this.redis.getStudentsByExam(examId);
  //     return this.response.success(
  //       { count: students.length, students },
  //       'Active students fetched successfully',
  //       200,
  //     );
  //   } catch (e) {
  //     console.error('❌ Error fetching active students:', e);
  //     return this.response.error('Failed to fetch active students', 500);
  //   }
  // }

  // -------------------------------
  // 2. Get Student Progress
  // -------------------------------
  @Get('student-progress')
  async getStudentProgress(
    @Query('studentId') studentId: string,
    @Query('examId', ParseIntPipe) examId: number,
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const progress = await this.redis.getProgress(studentId, examId);
      const attendanceSnapshot = await this.redis.getAttendanceSnapshot();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const moreDetails = attendanceSnapshot.find(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (it) => it.studentId === studentId && it.examId === examId,
      );
      if (!progress) {
        return this.response.success(
          {
            answers: [],
            currentIndex: 0,
            questionMeta: [],
            totalQuestionsAnswered: 0,
          },
          'No saved progress found for this student',
          200,
        );
      }
      console.log('retrieved data:', moreDetails);
      return this.response.success(
        {
          ...progress,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          timeLeft: moreDetails?.timeLeft ?? null,
        },
        'Progress fetched successfully',
        200,
      );
    } catch (e) {
      console.error('❌ Error fetching student progress:', e);
      return this.response.error('Error fetching progress', 500);
    }
  }

  // -------------------------------
  // 3. Save Student Progress
  // -------------------------------
  @Post('student-progress')
  async updateStudentProgress(
    @Body()
    body: UpdateStudentProgressDto,
  ) {
    console.log('Incoming progress:', body);
    const { studentId, examId, progress } = body;

    // Basic validation
    if (!studentId || !examId || !progress) {
      return this.response.error(
        'studentId, examId, and progress are required',
        400,
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await this.redis.saveProgress(studentId, examId, progress);

      return this.response.success(
        progress,
        'Progress saved successfully',
        201,
      );
    } catch (e) {
      console.error('❌ Error saving student progress:', e);
      return this.response.error('Failed to update student progress', 500);
    }
  }
}
