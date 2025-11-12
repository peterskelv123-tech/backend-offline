import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client;

  constructor() {
    this.client = createClient({ url: 'redis://localhost:6379' });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.client
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .connect()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .then(() => console.log('✅ Redis connected successfully!'))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .catch((err) => console.error('❌ Redis connection failed:', err));
  }
  // ✅ Get all students taking a particular exam
  async getStudentsByExam(examId: number) {
    const allSnapshot = await this.getAttendanceSnapshot(); // gets all student records
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return allSnapshot.filter((student) => student.examId === examId);
  }

  // ✅ Save or update student
  async setAttendance(studentId: string, data: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const existingJson = await this.client.hGet('attendance', studentId);

    let existing = {};
    if (existingJson && typeof existingJson === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        existing = JSON.parse(existingJson);
      } catch {
        existing = {};
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const merged = { ...existing, ...data };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hSet('attendance', studentId, JSON.stringify(merged));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return merged;
  }

  // ✅ Remove all students of a given exam
  async removeStudentsByExam(examId: number) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const all = await this.client.hGetAll('attendance');
    const delList: string[] = [];

    for (const [studentId, json] of Object.entries(all)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      let obj: any = {};
      if (typeof json === 'string') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          obj = JSON.parse(json);
        } catch {
          obj = {};
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (obj.examId === examId) delList.push(studentId);
    }

    if (delList.length) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.client.hDel('attendance', delList);
    }

    return delList.length;
  }

  // ✅ Snapshot of all current students
  async getAttendanceSnapshot() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const all = await this.client.hGetAll('attendance');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars
    return Object.entries(all).map(([_, json]) => JSON.parse(json as string));
  }

  // ✅ Remove one student
  async removeStudent(studentId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hDel('attendance', studentId);
  }

  async removeManyStudents(studentIds: string[]) {
    if (!studentIds.length) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hDel('attendance', studentIds);
  }

  // ✅ Clear all attendance (used when admin logs out)
  async clearAll() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.del('attendance');
  }

  // ✅ Admin presence tracking
  async setAdminOnline(state: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.set('admin-online', state ? 'true' : 'false');

    if (!state) {
      await this.clearAll(); // ✅ wipe stale attendance
    }
  }

  async isAdminOnline() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return (await this.client.get('admin-online')) === 'true';
  }

  // ✅ Clean shutdown
  async onModuleDestroy() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.quit();
  }
}
