/* eslint-disable prettier/prettier */
import { Controller, Get, Query } from "@nestjs/common";
import { QuestionService } from "./question.service";
import { ResponseService } from "src/commonServices/response.services";
@Controller('questions')
export class QuestionController {
    constructor(
        private readonly questionService: QuestionService,
        private readonly responseService: ResponseService,
    ) {}
    @Get('/exam-taker')
async examTakerQuestions(@Query('examId') examId: number) {
  try {
    const studentQuestions = await this.questionService.examTakerQuestions(examId);

    // If the service returned successfully, we have questions
    return this.responseService.success(
      studentQuestions,
      'Questions fetched successfully',
      200,
    );
  } catch (error) {
    return this.responseService.error(
      (error as Error).message ?? 'Failed to fetch questions',
      500,
    );
  }
}
}
