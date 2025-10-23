/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ExamServices } from "./exam.services";
import { ResponseService } from "src/commonServices/response.services";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { ExamDataDto } from "src/DTO/examDataDto";
@Controller('exams')
export class ExamController {
  constructor(
    private readonly examService: ExamServices,
    private readonly responseService: ResponseService,
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
@Get('take')
async takeExam(@Query('className') className: string) {
  try {
    const exam = await this.examService.TakeAnExam(className);
    return this.responseService.success(
      exam,
      'Exam retrieved successfully',
      200,
    );
  } catch (error) {
    return this.responseService.error(
      (error as Error).message ?? 'Failed to retrieve exam')}   
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