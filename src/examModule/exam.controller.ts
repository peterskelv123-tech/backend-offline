/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, ParseBoolPipe, ParseIntPipe, Post, Put, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ExamServices } from "./exam.services";
import { ResponseService } from "src/commonServices/response.services";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { ExamDataDto } from "src/DTO/examDataDto";
import { RedisService } from "src/commonServices/Redis.service";
import { AttendanceGateway } from "src/commonServices/gateways/attendance.gateway";
@Controller('exams')
export class ExamController {
  constructor(
private readonly examService: ExamServices,
  private readonly responseService: ResponseService,
  private readonly redis: RedisService,
  private readonly attendanceGateway: AttendanceGateway,
  ) { }
@Get()
async getExams(@Query('page') page?: number) {
  try {
    const pageNumber = page ? Number(page) : 1;
    const exams = await this.examService.getPaginatedExams(pageNumber);
    return this.responseService.success(
      exams,
      'Exams retrieved successfully',
      200,
    );
  } catch (error) {
    return this.responseService.error(
      (error as Error).message ?? 'Failed to retrieve exams',
      500,
    );
  }
}
@Put()
async updateExamStatus(
  @Query('examId', ParseIntPipe) examId: number,
  @Query('status', ParseBoolPipe) status: boolean
) {
  try {
    const data = await this.examService.updateExamStatus(examId, status);

    // ✅ If the exam is being deactivated (stopped)
    if (!status) {
      // 1. Broadcast to all students taking this exam (OPTION A)
      this.attendanceGateway.forceStopByExamId(examId);

      // 2. Remove all students for this exam from Redis
      await this.redis.removeStudentsByExam(examId);
    }

    return this.responseService.success(
      data,
      'Exam status updated successfully',
      200,
    );
  } catch (error) {
    return this.responseService.error(
      (error as Error).message ?? 'Failed to update exam',
      500,
    );
  }
}

@Delete()
async deleteAnExam(
  @Query('examId', ParseIntPipe) examId: number
) {
  try {
    const examDetails = await this.examService.findOne(examId);

    if (!examDetails) {
      return this.responseService.error("Exam not found", 404);
    }

    // ✅ Prevent deleting active exam
    if (examDetails.status === true) {
      return this.responseService.error(
        "Can't delete an ongoing exam",
        400
      );
    }

    // ✅ Safe to delete
    const data = await this.examService.deleteAnExamEntry(examId);

    return this.responseService.success(
      data,
      "Exam deleted successfully",
      200
    );

  } catch (error) {
    return this.responseService.error(
      (error as Error).message ?? "Failed to delete exam",
      500
    );
  }
}

@Get('take')
async takeExam(@Query('className') className: string,@Query('regNo') regNo: string) {
  try {
    const exam = await this.examService.TakeAnExam(className, regNo);
    return this.responseService.success(
      exam,
      'Exam retrieved successfully',
      200,
    );
  } catch (error) {
  return this.responseService.error(
    (error as Error).message ?? 'Failed to retrieve exam',
    500,
  );
    }   
    }
    @Post()
@UseInterceptors(FileInterceptor('questionFile', {
  storage: diskStorage({
    destination: './uploads/questions',
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
  }),
}))
async createExam(
  @UploadedFile() questionFile: Express.Multer.File,
  @Body() body: ExamDataDto,
) {
  try {
    // ✅ Debug (you can remove these now that it's working)
    //console.log('Raw body:', req.body);
   // console.log('DTO instance:', body instanceof ExamDataDto, body);
 //   console.log('Uploaded File:', questionFile);
    // ✅ Ensure a file was uploaded
    if (!questionFile) {
      return this.responseService.error('Question file is required', 400);
    }
    // ✅ Call your service to create the exam
    const createdExam = await this.examService.addToExam(body, questionFile.path);
    return this.responseService.success(
      createdExam,
      'Exam created successfully',
      201,
    );
  } catch (error) {
    console.error('Error in createExam:', error);
    return this.responseService.error(
      (error as Error).message ?? 'Failed to create exam',
      500,
    );
  }
}
}