import { BaseService } from 'src/commonServices/BaseServices';
import { Class } from './class.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
export class ClassService extends BaseService<Class> {
  constructor(
    @InjectRepository(Class)
    repo: Repository<Class>,
    protected readonly dbHealth: DatabaseHealthService,
  ) {
    super(repo, dbHealth);
  }
  searchClass(searchItem: string): Promise<Class[]> {
    return this.searchMethod(Class, searchItem);
  }
}
