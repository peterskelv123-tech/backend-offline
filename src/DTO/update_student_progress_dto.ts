import { Type } from 'class-transformer';
import { IsNumber, IsString, ValidateNested } from 'class-validator';
import { ProgressDto } from './progressDTO';

export class UpdateStudentProgressDto {
  @IsString()
  studentId: string;

  @IsNumber()
  examId: number;

  @ValidateNested()
  @Type(() => ProgressDto)
  progress: ProgressDto;
}
