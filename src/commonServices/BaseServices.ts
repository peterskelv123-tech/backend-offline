/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable prettier/prettier */
// eslint-disable-next-line prettier/prettier
import { DeepPartial, ObjectLiteral, Repository,ILike,EntityManager,DataSource } from "typeorm";
import { DatabaseHealthService } from './database-health.service';

export abstract class BaseService<T extends ObjectLiteral> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly dbHealth: DatabaseHealthService,
    protected readonly dataSource: DataSource,
  ) {}

  /**
   * Allow services to run inside a transaction when required.
   */
  async transactional<R>(
    work: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    await this.dbHealth.ensureConnection();
    return await this.dataSource.transaction(work);
  }

  /**
   * Select the correct repository (normal or transactional).
   */
  protected getRepo(manager?: EntityManager) {
    return manager
      ? manager.getRepository(this.repository.target)
      : this.repository;
  }

  async findOne(id: number, manager?: EntityManager): Promise<T | null> {
    await this.dbHealth.ensureConnection();
    return await this.getRepo(manager).findOneBy({ id } as any);
  }

  async create(data: DeepPartial<T>, manager?: EntityManager): Promise<T> {
    await this.dbHealth.ensureConnection();
    return await this.getRepo(manager).save(data);
  }

  async delete(id: number, manager?: EntityManager): Promise<void> {
    await this.dbHealth.ensureConnection();
    await this.getRepo(manager).delete(id);
  }

  async searchByKey(
    key: string,
    keyword: string,
    manager?: EntityManager,
  ): Promise<T[]> {
    const validColumns = this.repository.metadata.columns.map(
      (c) => c.propertyName,
    );

    if (!validColumns.includes(key)) {
      throw new Error(`Invalid search field: ${key}`);
    }

    await this.dbHealth.ensureConnection();

    return await this.getRepo(manager).find({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: { [key]: ILike(`%${keyword}%`) } as any,
      take: 5,
    });
  }
  async searchMethod(
  entityClass: new () => T,
  keyword: string,
  manager?: EntityManager,
): Promise<T[]> {
  const repo = this.getRepo(manager);

  // ✅ Extract all property keys
  const keys = Object.keys(new entityClass());

  // ✅ Run all searches in parallel
  const allResults = await Promise.all(
    keys.map((key) => this.searchByKey(key, keyword, manager)),
  );

  // ✅ Flatten nested arrays
  const merged = allResults.flat();

  // ✅ Deduplicate using JSON.stringify (simple + reliable)
  const uniqueResults = Array.from(
    new Set(merged.map((r) => JSON.stringify(r))),
  ).map((str) => JSON.parse(str));

  return uniqueResults;
}
}
