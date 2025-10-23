import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from 'src/commonServices/BaseServices';
import { Attendance } from './attendance.entity';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import { Repository } from 'typeorm';

@Injectable()
export class AttendaceServices extends BaseService<Attendance> {
  constructor(
    @InjectRepository(Attendance)
    protected readonly repo: Repository<Attendance>,
    protected readonly dbHealth: DatabaseHealthService,
  ) {
    super(repo, dbHealth);
  }
  async markAttendance(DeepPartial: Partial<Attendance>): Promise<Attendance> {
    const attendanceRecord = this.repo.create(DeepPartial);
    return this.repo.save(attendanceRecord);
  }
  async getAttendanceByExam(examId: number): Promise<Partial<Attendance>[]> {
    return this.repo
      .createQueryBuilder('attendance')
      .select(['attendance.id', 'attendance.regNo', 'attendance.attended'])
      .where('attendance.examId = :examId', { examId })
      .getMany();
  }
  async updateAttendance(id: number, attended: boolean): Promise<Attendance> {
    const attendanceRecord = await this.repo.findOneBy({ id });
    if (!attendanceRecord) {
      throw new Error('Attendance record not found');
    }
    this.repo.merge(attendanceRecord, { attended });
    return this.repo.save(attendanceRecord);
  }
}
