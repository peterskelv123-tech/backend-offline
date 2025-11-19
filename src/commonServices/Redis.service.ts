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
  async getStudent(studentId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const json = await this.client.hGet('attendance', studentId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return json ? JSON.parse(json) : null;
  }

  // ✅ Save or update student
  async setAttendance(studentId: string, data: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const existingJson = await this.client.hGet('attendance', studentId);

    let existing: any = {};
    if (existingJson && typeof existingJson === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        existing = JSON.parse(existingJson);
      } catch {
        existing = {};
      }
    }

    // Safely merge: only overwrite fields that exist in `data`
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const merged = {
      ...existing,
      ...data,
      // optionally: explicitly preserve timeLeft if not in `data`
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      timeLeft: data.timeLeft ?? existing.timeLeft,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hSet('attendance', studentId, JSON.stringify(merged));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    console.log('merged data:', merged);
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
    console.log('all attendance:', all);
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
  async getProgress(studentId: string, examId: number) {
    const key = `progress:${examId}:${studentId}`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const data = await this.client.hGetAll(key);
    if (!data || Object.keys(data).length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const questionMeta = data.questionMeta ? JSON.parse(data.questionMeta) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const answers = data.answers ? JSON.parse(data.answers) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, prettier/prettier
    const currentIndex = Number.isFinite(Number(data.currentIndex))?parseInt(data.currentIndex, 10) : 0;
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      answers,
      currentIndex,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      questionMeta,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      totalQuestionsAnswered: questionMeta.length,
    };
  }
  async removeStudentIfFinished(studentId: string, examTotalQuestions: number) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const student = await this.getStudent(studentId);
    if (!student) return null;
    if (
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      student.timeLeft <= 0 ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (student.answered ?? 0) >= examTotalQuestions
    ) {
      await this.removeStudent(studentId);
      return true;
    }
    // otherwise mark inactive
    await this.setAttendance(studentId, { active: false });
    return false;
  }

  async saveProgress(
    studentId: string,
    examId: number,
    progress: {
      answers: any[];
      currentIndex: number;
      questionMeta: { id: number; question: string; options: any[] }[];
    },
  ) {
    const key = `progress:${examId}:${studentId}`;

    // Save progress in Redis
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hSet(key, {
      answers: JSON.stringify(progress.answers),
      currentIndex: progress.currentIndex.toString(),
      questionMeta: JSON.stringify(progress.questionMeta),
    });

    // Set optional TTL
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.expire(key, 24 * 60 * 60); // 24 hours
    return {
      answers: progress.answers,
      currentIndex: progress.currentIndex,
      questionMeta: progress.questionMeta,
    };
    // ✅ Fetch and log the content immediately for debugging
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  }
  // ✅ Clean shutdown
  async onModuleDestroy() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.quit();
  }
}
