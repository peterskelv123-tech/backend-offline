/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
  /* async getStudentsByExam(examId: number) {
    const allSnapshot = await this.getAttendanceSnapshot(); // gets all student records
    return allSnapshot.filter(
      (student) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        Array.isArray(student.exams) &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        student.exams.some((e) => e.examId === examId),
    );
  }*/
  async getStudent(studentId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const json = await this.client.hGet('attendance', studentId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    console.log('fetched student attendance:', json);
    return json ? JSON.parse(json) : null;
  }

  async setAttendance(studentId: string, data: any) {
    // Fetch existing attendance for this student
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const existingJson = await this.client.hGet('attendance', studentId);

    let attendanceList: any[] = [];

    // Parse safely
    if (existingJson && typeof existingJson === 'string') {
      try {
        const parsed = JSON.parse(existingJson);
        attendanceList = Array.isArray(parsed) ? parsed : [];
      } catch {
        attendanceList = [];
      }
    }
    // -------------------------
    //   FIND EXISTING EXAM ENTRY
    // -------------------------
    const index = attendanceList.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (entry) => entry.examId === data.examId,
    );

    if (index !== -1) {
      // Update existing exam entry
      attendanceList[index] = data;
    } else {
      // Create new exam entry
      attendanceList.push(data);
    }

    // Save back to Redis
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hSet(
      'attendance',
      studentId,
      JSON.stringify(attendanceList),
    );

    console.log('updated attendance:', attendanceList);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return attendanceList;
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

  async getAttendanceSnapshot() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const all = await this.client.hGetAll('attendance');

    const snapshot: any[] = [];

    for (const [studentId, json] of Object.entries(all)) {
      let attendanceList: any[] = [];
      try {
        const parsed = JSON.parse(json as string);
        attendanceList = Array.isArray(parsed) ? parsed : [];
      } catch {
        attendanceList = [];
      }

      attendanceList.forEach((entry) => {
        snapshot.push({
          ...entry,
          studentId,
          // eslint-disable-next-line prettier/prettier, @typescript-eslint/no-unsafe-member-access
          timeLeft: entry.timeLeft !== undefined  ? Math.max(0, Math.floor(Number(entry.timeLeft))) : null,
        });
      });
    }

    return snapshot;
  }

  // ✅ Remove one student
  async removeStudent(studentId: string, examId?: number) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const existingJson = await this.client.hGet('attendance', studentId);
    if (!existingJson) return;

    let attendanceList: any[] = [];
    try {
      const parsed = JSON.parse(existingJson);
      attendanceList = Array.isArray(parsed) ? parsed : [];
    } catch {
      attendanceList = [];
    }

    if (examId !== undefined) {
      // Remove specific exam
      attendanceList = attendanceList.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (entry) => entry.examId !== examId,
      );
    } else {
      // Remove entire student
      attendanceList = [];
    }

    if (attendanceList.length === 0) {
      // Delete the student key entirely
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.client.hDel('attendance', studentId);
    } else {
      // Save back remaining exams
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.client.hSet(
        'attendance',
        studentId,
        JSON.stringify(attendanceList),
      );
    }
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

    // 🔹 1) Get progress data
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const data = await this.client.hGetAll(key);
    if (!data || Object.keys(data).length === 0) return null;

    let questionMeta = [];
    let answers = [];
    let currentIndex = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      questionMeta = data.questionMeta ? JSON.parse(data.questionMeta) : [];
    } catch {
      questionMeta = [];
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      answers = data.answers ? JSON.parse(data.answers) : [];
    } catch {
      answers = [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof data.currentIndex === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const parsed = Number(data.currentIndex);
      currentIndex = Number.isFinite(parsed) ? parsed : 0;
    }

    // 🔹 2) Fetch attendance array (multi-exam structure)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const attendanceRaw = await this.client.hGet('attendance', studentId);

    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    let attendance: any | null = null;
    let timeLeft = null;
    let active = null;

    try {
      const parsed = JSON.parse(attendanceRaw);

      if (Array.isArray(parsed)) {
        attendance = parsed;

        // 🔹 3) Find THIS exam's attendance entry
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const examEntry = parsed.find((e) => e.examId === examId);

        if (examEntry) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          timeLeft = examEntry.timeLeft ?? null;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          active = examEntry.active ?? null;
        }
      }
    } catch {
      // ignore bad JSON
    }

    // 🔹 4) Return combined result
    return {
      answers,
      currentIndex,
      questionMeta,
      totalQuestionsAnswered: answers.length,
      // ---> NEWLY ADDED fields
      attendance: attendance ? attendance : [],
      timeLeft,
      active,
    };
  }

  async removeStudentIfFinished(
    studentId: string,
    examId: number,
    examTotalQuestions: number,
  ) {
    const key = `${studentId}:${examId}`;

    // Get the exam entry directly
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const json = await this.client.hGet('attendance', key);
    if (!json) return null;

    let entry: any;
    try {
      entry = JSON.parse(json);
    } catch {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const finishedByTime = entry.timeLeft <= 0;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const finishedByQuestions = (entry.answered ?? 0) >= examTotalQuestions;

    if (finishedByTime || finishedByQuestions) {
      // Remove ONLY this exam
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.client.hDel('attendance', key);
      return true;
    }

    // Otherwise mark as inactive
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    entry.active = false;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hSet('attendance', key, JSON.stringify(entry));
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

    // Normalize values
    const normalized = {
      answers: JSON.stringify(progress.answers ?? []),
      currentIndex: String(progress.currentIndex ?? 0),
      questionMeta: JSON.stringify(progress.questionMeta ?? []),
    };

    // Save to Redis
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.hSet(key, normalized);

    // Optional TTL (24 hours)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.expire(key, 24 * 60 * 60);

    return {
      answers: progress.answers ?? [],
      currentIndex: progress.currentIndex ?? 0,
      questionMeta: progress.questionMeta ?? [],
    };
  }

  // ✅ Clean shutdown
  async onModuleDestroy() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.client.quit();
  }
}
