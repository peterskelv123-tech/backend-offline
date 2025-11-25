/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Post, Query } from "@nestjs/common";
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
    @Delete()
    async deleteResult(@Query("resultId") resultId:number){
    try {
        await this.resultServices.delete(resultId)
        return this.responseServices.success(
            null,
            'Result deleted successfully',
            200,
          );
    } catch (error) {
            return this.responseServices.error(
                (error as Error).message ?? 'Failed to delete result',
                500,
              );
        }}    
    @Get()
    async viewResult(@Query("className") className:string,@Query("subject") subject:string, @Query("examType") examType:string){
    try {
        const data=await this.resultServices.viewResult(className,subject,examType)
        if (!data.length) {
    return this.responseServices.error("result not yet available", 404);
        }   
        else{
            return this.responseServices.success(data,"result fetched successfully",200)
        }
    } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        return this.responseServices.error(error.message??"internal server error",500)
    }    
    }
}