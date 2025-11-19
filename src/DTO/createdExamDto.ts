import { ExamDataDto } from './examDataDto';

export class CreateExamDto {
  examData: ExamDataDto;
  questionFile: string;
}
export class ExpectedResultDTO {
  examId: number;
  regNo: string;
  score: number;
  highestScorePossible: number;
}
