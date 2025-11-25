import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ClassService } from './class.services';
import { ResponseService } from '../commonServices/response.services';
import type { DeepPartial } from 'typeorm';
import { Class } from './class.entity';

@Controller('class')
export class ClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly response: ResponseService,
  ) {}

  @Get('search')
  async search(@Query('keyword') keyword: string) {
    try {
      const results = await this.classService.searchClass(keyword);

      return this.response.success(
        results,
        results.length ? 'Subjects found successfully' : 'No subjects found',
        200,
      );
    } catch (error) {
      return this.response.error(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        error?.message || 'An unexpected error occurred',
        500,
      );
    }
  }
  @Get()
  async findAll() {
    try {
      const data = await this.classService.findAll();
      if (!data.length) {
        return this.response.error('there is no class in the database', 404);
      } else {
        return this.response.success(data, 'classes fetched successfully', 200);
      }
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      return this.response.error(error.message ?? 'internal server error', 500);
    }
  }
  @Post('/')
  async addToSubject(@Body() subject: DeepPartial<Class>) {
    try {
      // ✅ 1. Check if subject already exists
      const existingSubjects = await this.classService.searchClass(
        subject.Name ?? '',
      );
      const exist = existingSubjects.length > 0;
      if (exist) {
        return this.response.error('Class already exists', 409); // 409 Conflict
      }

      // ✅ 2. Create new subject
      const created = await this.classService.create(subject);

      // ✅ 3. Return success response
      return this.response.success(
        created,
        'Subject created successfully',
        201,
      );
    } catch (error) {
      return this.response.error(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        error.message ?? 'An unexpected error occurred',
        500,
      );
    }
  }
}
