import { IsNumber, IsString } from 'class-validator';

export class AnswerDTO {
  @IsNumber()
  questionId: number;
  @IsString()
  answerText: string;
}
