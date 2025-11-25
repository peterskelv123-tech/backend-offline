// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectModule } from './subjectModule/subject.module';
import { CommonModule } from './commonServices';
import { ClassModule } from './classModule';
import { QuestionModule } from './QuestionModule';
import { ExamModule } from './examModule';
import { ConfigModule } from '@nestjs/config';
import { ResultModule } from './resultModule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppDataSource } from 'data-source';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => AppDataSource.options,
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
