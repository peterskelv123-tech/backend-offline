import { IsArray, IsNumber, IsString } from 'class-validator';

export class QuestionMetaDto {
  @IsNumber()
  id: number;

  @IsString()
  question: string;

  @IsArray()
  options: any[];
}
