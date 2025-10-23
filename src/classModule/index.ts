// src/subjectModule/subject.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class } from './class.entity';
import { ClassService } from './class.services';
import { ClassController } from './class.controller';
@Module({
  imports: [TypeOrmModule.forFeature([Class])],
  providers: [ClassService],
  exports: [ClassService, TypeOrmModule],
  controllers: [ClassController],
})
export class ClassModule {}
