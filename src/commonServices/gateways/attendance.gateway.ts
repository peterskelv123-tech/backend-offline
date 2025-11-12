import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from 'src/commonServices/Redis.service';
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AttendanceGateway {
  @WebSocketServer()
  server: Server;

  constructor(private redis: RedisService) {}
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
    const { studentId, admin } = client.data || {};
    console.log('📤 handleDisconnect fired with data:', client.data);

    if (studentId) {
      this.studentSockets.delete(studentId);
      console.log(`🧑‍🎓 Student disconnected: ${studentId}`);
      await this.redis.removeStudent(studentId);

      // Emit full snapshot to admin
      if (await this.redis.isAdminOnline()) {
        const snapshot = await this.redis.getAttendanceSnapshot();
        this.server.to('admin-room').emit('attendance-update', snapshot);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.server.to('admin-room').emit('student-left', { studentId });
    }

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

    // ✅ Get all students from Redis
    const snapshot = await this.redis.getAttendanceSnapshot();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const redisStudentIds = snapshot.map((s) => s.studentId);

    // ✅ Get all currently connected student sockets
    const connectedStudentIds = this.getConnectedStudents();
    // Example output: ['James', 'Ola', 'Kelvin']

    // ✅ Determine ghost users (exist in Redis but not connected)
    const ghosts = redisStudentIds.filter(
      (id) => !connectedStudentIds.includes(id),
    );

    // ✅ Delete ghosts in ONE redis call (faster)
    if (ghosts.length > 0) {
      await this.redis.removeManyStudents(ghosts);
      console.log(`🧹 Removed ghost students:`, ghosts);
    }

    // ✅ Send updated snapshot to admin
    const finalSnapshot = await this.redis.getAttendanceSnapshot();
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
      const snapshot = await this.redis.getAttendanceSnapshot();
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
      const snapshot = await this.redis.getAttendanceSnapshot();
      this.server.to('admin-room').emit('attendance-update', snapshot);
    }
  }

  // ✅ ADMIN STOPS ONE STUDENT
  @SubscribeMessage('admin-stop-exam')
  async stopExam(@MessageBody() data: { studentId: string }) {
    const { studentId } = data;

    // ✅ Remove student from Redis
    await this.redis.removeStudent(studentId);

    // ✅ Find the student socket
    const studentSocket = this.studentSockets.get(studentId);

    if (studentSocket) {
      console.log(`📡 Emitting force-stop to student ${studentId}`);
      studentSocket.emit('force-stop', { studentId });
    } else {
      console.log(`⚠️ Student socket not found for ${studentId}`);
    }

    // ✅ Update admin dashboard if admin is online
    if (await this.redis.isAdminOnline()) {
      const snapshot = await this.redis.getAttendanceSnapshot();
      this.server.to('admin-room').emit('attendance-update', snapshot);
    }

    // ✅ Notify admin specifically that this student was stopped
    this.server.to('admin-room').emit('student-stopped', { studentId });
  }

  // ✅ ADMIN STOPS ENTIRE EXAM
  forceStopByExamId(examId: number) {
    this.server.to('exam-room').emit('force-stop-exam', { examId });
    this.server.to('admin-room').emit('exam-stopped', { examId });
  }

  // ✅ STUDENT LEAVES EXPLICITLY (submit)
  @SubscribeMessage('student-leave')
  async handleStudentLeave(
    @MessageBody() data: { studentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    client.data.studentId = data.studentId;
    console.log(`👋 Student-leave received for ${data.studentId}`);

    await this.redis.removeStudent(data.studentId);

    if (await this.redis.isAdminOnline()) {
      const snapshot = await this.redis.getAttendanceSnapshot();
      this.server.to('admin-room').emit('attendance-update', snapshot);
    }

    this.server
      .to('admin-room')
      .emit('student-left', { studentId: data.studentId });

    client.disconnect();
    return { ok: true };
  }
}
