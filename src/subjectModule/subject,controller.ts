/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SubjectService } from './subject.services';
import { ResponseService } from '../commonServices/response.services';
import { Subject } from './subject.entity';
import type { DeepPartial } from 'typeorm';

@Controller('subjects')
export class SubjectController {
  constructor(
    private readonly subjectService: SubjectService,
    private readonly response: ResponseService,
  ) {}

  @Get('search')
  async search(@Query('keyword') keyword: string) {
    try {
      const results = await this.subjectService.searchSubjects(keyword);

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
      const data = await this.subjectService.findAll();

      if (!data.length) {
        return this.response.error('No subjects in the database', 404);
      }

      return this.response.success(data, 'Subjects fetched successfully', 200);
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return this.response.error(error.message ?? 'Internal server error', 500);
    }
  }
  @Post('/')
  async addToSubject(@Body() subject: DeepPartial<Subject>) {
    try {
      // ✅ 1. Check if subject already exists
      const existingSubjects = await this.subjectService.searchSubjects(
        subject.Name ?? '',
      );
      const exist = existingSubjects.length > 0;

      if (exist) {
        return this.response.error('Subject already exists', 409); // 409 Conflict
      }

      // ✅ 2. Create new subject
      const created = await this.subjectService.create(subject);

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
