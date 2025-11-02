/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { Subject } from './subject.entity';
import { BaseService } from 'src/commonServices/BaseServices';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';

@Injectable()
export class SubjectService extends BaseService<Subject> {
  constructor(
    @InjectRepository(Subject)
    repo: Repository<Subject>,

    protected readonly dbHealth: DatabaseHealthService,

    protected readonly dataSource: DataSource,
  ) {
    super(repo, dbHealth, dataSource);  // ✅ FIXED
  }

  async searchSubjects(keyword: string): Promise<Subject[]> {
    return this.searchMethod(Subject, keyword);
  }
}
