// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectModule } from './subjectModule/subject.module';
import { Subject } from './subjectModule/subject.entity';
import { CommonModule } from './commonServices';
import { ClassModule } from './classModule';
import { QuestionModule } from './QuestionModule';
import { ExamModule } from './examModule';
import { Class } from './classModule/class.entity';
import { Question } from './QuestionModule/question.entity';
import { Exam } from './examModule/exam.entity';
import { ConfigModule } from '@nestjs/config';
import { Result } from './resultModule/result.entity';
import { ResultModule } from './resultModule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 👈 makes env vars available app-wide
    }),
    TypeOrmModule.forRoot({
      type: 'mysql', // or 'mysql' or 'sqlite'
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      database: 'CBTDB',
      entities: [Subject, Class, Question, Exam, Result],
    }),
    CommonModule,
    SubjectModule,
    ClassModule,
    QuestionModule,
    ExamModule,
    ResultModule,
  ],
  providers: [AppService],
  exports: [AppService],
  controllers: [AppController],
})
export class AppModule {}
