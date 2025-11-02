import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { AnswerDTO } from './answerDTO';
import { Type } from 'class-transformer';

export class StudentUploadDTO {
  @IsString()
  regNo: string;

  @IsNumber()
  examId: number;

  @IsArray()
  @ValidateNested({ each: true }) // ensures every item in the array is validated
  @Type(() => AnswerDTO) // required so NestJS knows how to transform and validate the inner objects
  answers: AnswerDTO[];
}
