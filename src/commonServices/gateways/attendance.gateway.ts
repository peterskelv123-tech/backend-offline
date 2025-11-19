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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const redisStudentIds = snapshot.map((s) => s.studentId);

    // 2️⃣ Get real currently connected studentIds
    const connectedStudentIds = this.getConnectedStudents();

    // 3️⃣ Ghosts = in redis but not connected
    const ghosts = redisStudentIds.filter(
      (id) => !connectedStudentIds.includes(id),
    );

    console.log('👻 Ghost students:', ghosts);

    // 4️⃣ Clean ghosts with helper
    if (ghosts.length > 0) {
      await Promise.all(
        ghosts.map(async (studentId) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const student = await this.redis.getStudent(studentId);

          if (!student) return;

          // lookup student’s examId (exists in Redis attendance)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const examId = student.examId;
          const exam = await this.exam.findOne(examId);

          if (!exam) return;

          const totalQuestions = exam.totalQuestions;

          // 🔥 use the same helper used for disconnect logic
          const removed = await this.redis.removeStudentIfFinished(
            studentId,
            totalQuestions,
          );

          if (!removed) {
            // mark ghost but not finished
            await this.redis.setAttendance(studentId, {
              active: false,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              timeLeft: student.timeLeft,
            });
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { examId, studentId, timeLeft } = data;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (this.studentSockets.has(studentId)) {
      console.log('♻️ Replacing old socket for', studentId);
      this.studentSockets.delete(studentId);
    }
    this.studentSockets.set(studentId, client);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    client.join('exam-room');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    client.data.studentId = studentId;

    const studentState = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      studentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      examId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      timeLeft,
      answered: 0,
      active: true,
    };
    await this.redis.setAttendance(studentId, studentState);

    if (await this.redis.isAdminOnline()) {
      const snapshot = (await this.redis.getAttendanceSnapshot()).filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (it) => it.active,
      );
      this.server.to('admin-room').emit('attendance-update', snapshot);
    }

    return { ok: true };
  }

  // ✅ STUDENT LIVE STATUS UPDATE
  @SubscribeMessage('student-status')
  async studentStatus(@MessageBody() data) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    await this.redis.setAttendance(data.studentId, data);
    //console.log(data);
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
  async stopExam(@MessageBody() data: { studentId: string }) {
    const { studentId } = data;

    // 1️⃣ Get student state
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const student = await this.redis.getStudent(studentId);
    if (!student) {
      console.log(`⚠️ No student found in Redis for ${studentId}`);
      return;
    }

    // 2️⃣ Fetch the student's exam
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    const exam = await this.exam.findOne(student.examId);
    if (!exam) {
      throw new Error('Student has no valid exam record');
    }

    const totalQuestions = exam.totalQuestions;

    // 3️⃣ Use the helper (removes if finished, marks inactive if not)
    const removed = await this.redis.removeStudentIfFinished(
      studentId,
      totalQuestions,
    );

    if (!removed) {
      // Student hasn't finished → mark inactive
      await this.redis.setAttendance(studentId, {
        active: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        timeLeft: student.timeLeft,
      });
    }

    // 4️⃣ Emit force-stop to the actual student
    const studentSocket = this.studentSockets.get(studentId);
    if (studentSocket) {
      console.log(`📡 Emitting force-stop to student ${studentId}`);
      studentSocket.emit('force-stop', { studentId });
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

    // 6️⃣ Emit stop notification
    this.server.to('admin-room').emit('student-stopped', { studentId });
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

    // 1️⃣ Mark student inactive
    await this.redis.setAttendance(studentId, {
      active: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      timeLeft: timeLeft,
    });

    // 2️⃣ Get fresh snapshot from Redis
    const snapshot = await this.redis.getAttendanceSnapshot();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const redisStudentIds = snapshot.map((s) => s.studentId);

    // 3️⃣ Get connected student IDs from sockets
    const connectedStudentIds = this.getConnectedStudents();

    // 4️⃣ Determine ghost users: exist in redis but socket not active
    const ghosts = redisStudentIds.filter(
      (id) => !connectedStudentIds.includes(id),
    );

    // 5️⃣ Mark all ghosts inactive (batch update)
    if (ghosts.length > 0) {
      await Promise.all(
        ghosts.map(async (id) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const idDetails = snapshot.find((it) => it.studentId === id);
          await this.redis.setAttendance(id, {
            active: false,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            timeLeft: idDetails.timeLeft ?? 0,
          });
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
