// src/subjectModule/subject.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './question.entity';
import { QuestionService } from './question.service';
import { ExamModule } from 'src/examModule';
import { QuestionController } from './question.controller';
@Module({
  imports: [TypeOrmModule.forFeature([Question]), forwardRef(() => ExamModule)],
  providers: [QuestionService],
  exports: [QuestionService], // so it can be used in other modules
  controllers: [QuestionController],
})
export class QuestionModule {}
