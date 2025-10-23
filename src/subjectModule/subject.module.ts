// src/subjectModule/subject.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subject } from './subject.entity';
import { SubjectService } from './subject.services';
import { SubjectController } from './subject,controller';
@Module({
  imports: [TypeOrmModule.forFeature([Subject])],
  providers: [SubjectService],
  exports: [SubjectService, TypeOrmModule], // so it can be used in other modules
  controllers: [SubjectController],
})
export class SubjectModule {}
