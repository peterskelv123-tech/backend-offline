import { IsEnum, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ExamType } from './examTypeDTO';
import { Term } from './termType';

export class ExamDataDto {
  @IsEnum(ExamType)
  examType: ExamType;

  @IsString()
  session: string;

  @IsEnum(Term)
  term: Term;

  @Type(() => Number)
  @IsNumber()
  totalQuestions: number;

  @Type(() => Number)
  @IsNumber()
  timeAllocated: number;

  @IsString()
  subject: string;

  @IsString()
  className: string;
}
