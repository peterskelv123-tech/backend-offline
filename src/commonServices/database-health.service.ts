import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseHealthService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureConnection() {
    try {
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }

      // Perform a simple ping query
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.error('Database connection failed:', error.message);
      throw new InternalServerErrorException(
        'Cannot connect to the database. Please try again later.',
      );
    }
  }
}
