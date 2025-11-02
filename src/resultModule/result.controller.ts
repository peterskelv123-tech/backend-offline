/* eslint-disable prettier/prettier */
import { Body, Controller, Post } from "@nestjs/common";
import { ResultService } from "./result.service";
import { ResponseService } from "src/commonServices/response.services";
import { StudentUploadDTO } from "src/DTO/studentUploadDTO";

@Controller('results')
export class ResultsController{
    constructor(
        private readonly resultServices:ResultService,
        private readonly responseServices:ResponseService
    ){}
    @Post()
    async uploadScore(@Body() body: StudentUploadDTO){
    try {
        const result = await this.resultServices.markNdAddToResult(
            body.answers,
            body.examId,
            body.regNo,
        ); 
        return this.responseServices.success(
            result,
            'Scores uploaded successfully',
            201,
          );
    } catch (error) {
            return this.responseServices.error(
                (error as Error).message ?? 'Failed to upload scores',
                500,
              );
        }
    }    
}