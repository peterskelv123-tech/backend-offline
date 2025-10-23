// src/subjectModule/subject.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamServices } from './exam.services';
import { Exam } from './exam.entity';
import { QuestionModule } from 'src/QuestionModule';
import { ExamController } from './exam.controller';
import { SubjectModule } from 'src/subjectModule/subject.module';
import { ClassModule } from 'src/classModule';
@Module({
  imports: [
    TypeOrmModule.forFeature([Exam]),
    forwardRef(() => QuestionModule),
    forwardRef(() => SubjectModule),
    forwardRef(() => ClassModule),
  ],
  providers: [ExamServices],
  exports: [ExamServices, TypeOrmModule],
  controllers: [ExamController],
})
export class ExamModule {}
