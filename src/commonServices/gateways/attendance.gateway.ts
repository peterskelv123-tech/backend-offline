/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from 'src/commonServices/Redis.service';
import { ExamServices } from 'src/examModule/exam.services';
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AttendanceGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private redis: RedisService,
    private exam: ExamServices,
  ) {}
  private studentSockets = new Map<string, Socket>();
  // ✅ Logs raw disconnect events from socket.io
  afterInit(server: Server) {
    server.on('connection', (socket) => {
      console.log('⚡ New WS connection:', socket.id);

      socket.on('disconnect', (reason) => {
        console.log('❌ disconnect event fired:', reason);
      });
    });
  }

  private getConnectedStudents(): string[] {
    const namespace = this.server.of('/');
    const ids: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, socket] of namespace.sockets) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (socket.data?.studentId) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        ids.push(socket.data.studentId);
      }
    }
    return ids;
  }

  // ✅ When a socket connects
  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  // ✅ When a socket disconnects
  async handleDisconnect(client: Socket) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { studentId, admin, examId } = client.data || {};
    console.log('📤 handleDisconnect fired with data:', client.data);

    // ===========================
    // STUDENT DISCONNECT LOGIC
    // ===========================
    if (studentId && examId) {
      this.studentSockets.delete(studentId);

      // 1️⃣ Load exam using service
      const exam = await this.exam.findOne(examId);
      if (!exam) {
        console.error(`❌ Exam with id ${examId} not found`);
        return;
      }

      const totalQuestions = exam.totalQuestions;

      // 2️⃣ Use helper to remove or mark inactive
      const wasRemoved = await this.redis.removeStudentIfFinished(
        studentId,
        examId,
        totalQuestions,
      );
      console.log(
        wasRemoved
          ? `🧹 Student ${studentId} removed — exam finished`
          : `🛑 Student ${studentId} disconnected but can resume later`,
      );

      // 3️⃣ Notify admin
      if (await this.redis.isAdminOnline()) {
        const snapshot = (await this.redis.getAttendanceSnapshot()).filter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (item) => item.active === true,
        );

        this.server.to('admin-room').emit('attendance-update', snapshot);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.server.to('admin-room').emit('student-left', { studentId });
    }

    // ===========================
    // ADMIN DISCONNECT LOGIC
    // ===========================
    if (admin) {
      console.log('🛑 Admin disconnected');
      await this.redis.setAdminOnline(false);
    }
  }

  // ✅ ADMIN JOIN DASHBOARD
  @SubscribeMessage('admin-join')
  async adminJoin(@ConnectedSocket() client: Socket) {
    client.join('admin-room');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    client.data.admin = true;

    await this.redis.setAdminOnline(true);
    console.log('✅ Admin joined live monitor');

    // 1️⃣ Fetch all students in Redis
    const snapshot = await this.redis.getAttendanceSnapshot();

    // 2️⃣ Get real currently connected studentIds
    const connectedStudentIds = this.getConnectedStudents();

    // 3️⃣ Ghosts = in redis but not connected
    const ghosts = snapshot
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      .map((s) => s.studentId)
      .filter((id) => !connectedStudentIds.includes(id));

    console.log('👻 Ghost students:', ghosts);

    // 4️⃣ Clean ghosts with helper
    if (ghosts.length > 0) {
      await Promise.all(
        ghosts.map(async (studentId) => {
          const studentExams = await this.redis.getStudent(studentId); // array of exams
          if (!studentExams || !Array.isArray(studentExams)) return;

          for (const examEntry of studentExams) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const examId = examEntry.examId;
            const exam = await this.exam.findOne(examId);
            if (!exam) continue;

            const totalQuestions = exam.totalQuestions;

            const removed = await this.redis.removeStudentIfFinished(
              studentId,
              examId,
              totalQuestions,
            );

            if (!removed) {
              // mark only this exam inactive
              await this.redis.setAttendance(studentId, {
                ...examEntry,
                active: false,
              });
            }
          }
        }),
      );
    }

    // 5️⃣ Final accurate snapshot for admin
    const finalSnapshot = (await this.redis.getAttendanceSnapshot()).filter(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (it) => it.active,
    );

    client.emit('attendance-snapshot', finalSnapshot);
  }

  // ✅ STUDENT STARTS EXAM
  // ✅ STUDENT JOIN EXAM
  @SubscribeMessage('student-join')
async studentJoin(@MessageBody() data, @ConnectedSocket() client) {
  const { examId, studentId } = data;

  const merged = {
    studentId,
    examId,
    active: true,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    answered: data.answered ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    timeLeft: data.timeLeft ?? 0,
  };

  // Always store as an array
  const studentExams = await this.redis.getStudent(studentId) || [];

  // Add or replace existing exam entry
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const index = studentExams.findIndex(e => e.examId === examId);

  if (index === -1) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    studentExams.push(merged);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    studentExams[index] = { ...studentExams[index], ...merged };
  }

  await this.redis.setAttendance(studentId, studentExams);

  this.studentSockets.set(studentId, client);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  client.join('exam-room');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  client.data.studentId = studentId;

  if (await this.redis.isAdminOnline()) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const snapshot = (await this.redis.getAttendanceSnapshot()).filter(it => it.active);
    this.server.to('admin-room').emit('attendance-update', snapshot);
  }

  return { ok: true };
}

  // ✅ STUDENT LIVE STATUS UPDATE
  @SubscribeMessage('student-status')
  async studentStatus(@MessageBody() data) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
   await this.redis.setAttendance(data.studentId, data)
  
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log(`⏳ Updated status for ${data.studentId} in exam ${data.examId}`);

    // Admin snapshot update
    if (await this.redis.isAdminOnline()) {
      const snapshot = (await this.redis.getAttendanceSnapshot()).filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (it) => it.active,
      );
      this.server.to('admin-room').emit('attendance-update', snapshot);
    }
  }

  // ✅ ADMIN STOPS ONE STUDENT
  @SubscribeMessage('admin-stop-exam')
  async stopExam(@MessageBody() data: { studentId: string; examId: number }) {
    const { studentId, examId } = data;

    // 1️⃣ Get all exams for this student
    const studentExams = await this.redis.getStudent(studentId);
    if (!studentExams || !Array.isArray(studentExams)) {
      console.log(`⚠️ No student found in Redis for ${studentId}`);
      return;
    }

    // 2️⃣ Fetch the exam from DB
    const exam = await this.exam.findOne(examId);
    if (!exam) {
      throw new Error('Student has no valid exam record for this examId');
    }
    const totalQuestions = exam.totalQuestions;

    // 3️⃣ Remove exam if finished or mark inactive
    const removed = await this.redis.removeStudentIfFinished(
      studentId,
      examId,
      totalQuestions,
    );

    if (!removed) {
      // Exam not finished → mark inactive
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const index = studentExams.findIndex((e) => e.examId === examId);
      if (index !== -1) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        studentExams[index].active = false;
        await this.redis.setAttendance(studentId, studentExams);
      }
    }

    // 4️⃣ Emit force-stop to the student
    const studentSocket = this.studentSockets.get(studentId);
    if (studentSocket) {
      console.log(
        `📡 Emitting force-stop to student ${studentId} for exam ${examId}`,
      );
      studentSocket.emit('force-stop', { studentId, examId });
    } else {
      console.log(`⚠️ No active socket found for student ${studentId}`);
    }

    // 5️⃣ Update admin dashboard
    if (await this.redis.isAdminOnline()) {
      const snapshot = (await this.redis.getAttendanceSnapshot()).filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (it) => it.active,
      );
      this.server.to('admin-room').emit('attendance-update', snapshot);
    }

    // 6️⃣ Notify admin
    this.server.to('admin-room').emit('student-stopped', { studentId, examId });
  }
  // ✅ STUDENT LEAVES EXPLICITLY (submit)

  @SubscribeMessage('student-leave')
  async handleStudentLeave(
    @MessageBody() data: { studentId: string; timeLeft: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { studentId, timeLeft } = data;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    client.data.studentId = studentId;

    console.log(`👋 Student-leave received for ${studentId}`);

    // 1️⃣ Fetch all exams for this student
    const studentExams = await this.redis.getStudent(studentId);
    if (studentExams && Array.isArray(studentExams)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const updatedExams = studentExams.map((exam) => ({
        ...exam,
        active: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        timeLeft: exam.timeLeft ?? timeLeft,
      }));

      // Save back all entries
    Promise.all(
      updatedExams.map(async (exam) => {
        await this.redis.setAttendance(studentId, exam);
      }),
    );
    }

    // 2️⃣ Get fresh snapshot from Redis
    const snapshot = await this.redis.getAttendanceSnapshot();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const redisStudentIds = snapshot.map((s) => s.studentId);

    // 3️⃣ Get connected student IDs from sockets
    const connectedStudentIds = this.getConnectedStudents();

    // 4️⃣ Determine ghost users: exist in Redis but socket not active
    const ghosts = redisStudentIds.filter(
      (id) => !connectedStudentIds.includes(id),
    );

    // 5️⃣ Mark all ghosts inactive (batch update)
    if (ghosts.length > 0) {
      await Promise.all(
        ghosts.map(async (id) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const idDetails = snapshot.find((it) => it.studentId === id);
          const exams = await this.redis.getStudent(id);
          if (exams && Array.isArray(exams)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            const updated = exams.map((e) => ({
              ...e,
              active: false,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              timeLeft: e.timeLeft ?? idDetails.timeLeft ?? 0,
            }));
            await this.redis.setAttendance(id, updated);
          }
        }),
      );
      console.log(`👻 Marked ghost students inactive:`, ghosts);
    }

    // 6️⃣ Prepare final cleaned snapshot
    const finalSnapshot = (await this.redis.getAttendanceSnapshot()).filter(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (it) => it.active,
    );

    // 7️⃣ If admin is online, send cleaned snapshot
    if (await this.redis.isAdminOnline()) {
      this.server.to('admin-room').emit('attendance-update', finalSnapshot);
    }

    // 8️⃣ Notify admin specifically that this student left
    this.server.to('admin-room').emit('student-left', { studentId });

    // 9️⃣ Disconnect socket
    client.disconnect();

    return { ok: true };
  }
}
