// eslint-disable-next-line prettier/prettier
import { DeepPartial, ObjectLiteral, Repository,ILike } from "typeorm";
import { DatabaseHealthService } from './database-health.service';

export abstract class BaseService<T extends ObjectLiteral> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly dbHealth: DatabaseHealthService,
  ) {}

  /**
   * Dynamically extract keys (column names) from an entity class.
   * Works best when the class has default property values.
   */
  getKeysFromClass(entityClass: new () => T): string[] {
    const instance = new entityClass();
    return Object.keys(instance);
  }

  /**
   * Search by a single field using ILIKE (case-insensitive partial match).
   * Limits results to 5 entries.
   */
  async searchByKey(key: string, keyword: string): Promise<T[]> {
    const validColumns = this.repository.metadata.columns.map(
      (c) => c.propertyName,
    );

    if (!validColumns.includes(key)) {
      throw new Error(`Invalid search field: ${key}`);
    }
    await this.dbHealth.ensureConnection();
    return await this.repository.find({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: { [key]: ILike(`%${keyword}%`) } as any,
      take: 5,
    });
  }

  /**
   * Perform a keyword search across all entity fields.
   * Deduplicates results across multiple columns.
   */
  async searchMethod(
    entityClass: new () => T,
    searchItem: string,
  ): Promise<T[]> {
    const keys = this.getKeysFromClass(entityClass);

    // Run all searches in parallel
    const allResults = await Promise.all(
      keys.map((key) => this.searchByKey(key, searchItem)),
    );

    // Flatten nested arrays of results
    const merged = allResults.flat();

    // Deduplicate results (based on full object)
    const uniqueResults = Array.from(
      new Set(merged.map((r) => JSON.stringify(r))),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    ).map((str) => JSON.parse(str));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return uniqueResults;
  }

  /**
   * Find a single record by its ID.
   */
  async findOne(id: number): Promise<T | null> {
    await this.dbHealth.ensureConnection();
    return await this.repository.findOneBy({ id } as any);
  }

  /**
   * Create and save a new entity record.
   */
  async create(data: DeepPartial<T>): Promise<T> {
    await this.dbHealth.ensureConnection();
    return await this.repository.save(data);
  }
  async getitemByName(name: string): Promise<T | null> {
    if (
      this.getKeysFromClass(this.repository.target as new () => T).includes(
        'Name',
      )
    ) {
      await this.dbHealth.ensureConnection();
      return await this.repository.findOneBy({ Name: name } as any);
    } else {
      throw new Error(`Entity does not have a 'Name' field.`);
    }
  }
  /**z
   * Delete a record by ID.
   */
  async delete(id: number): Promise<void> {
    await this.dbHealth.ensureConnection();
    await this.repository.delete(id);
  }
}
