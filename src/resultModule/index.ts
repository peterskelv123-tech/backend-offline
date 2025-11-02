/* eslint-disable prettier/prettier */
import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Result } from "./result.entity";
import { QuestionModule } from "src/QuestionModule";
import { ResultService } from "./result.service";
import { ExamModule } from "src/examModule";
import { ResultsController } from "./result.controller";
@Module({
  imports: [
    TypeOrmModule.forFeature([Result]),
     forwardRef(()=>QuestionModule),
     forwardRef(()=>ExamModule),
  ],
  providers:[ResultService],
  exports:[ResultService,TypeOrmModule],
  controllers:[ResultsController]
})
export class ResultModule {}