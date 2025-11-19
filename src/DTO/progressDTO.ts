import { Type } from 'class-transformer';
import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { QuestionMetaDto } from './questionMetaDTO';

export class ProgressDto {
  @IsArray()
  answers: any[];

  @IsNumber()
  currentIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionMetaDto)
  questionMeta: QuestionMetaDto[];
}
