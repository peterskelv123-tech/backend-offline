/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { MediasoupService } from 'src/mediaSoup/mediaSoupService';
import { AttendanceService } from '../AttendanceService';
@WebSocketGateway({
  cors: { origin: '*' },
})
export class AttendanceGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private redis: RedisService,
    private exam: ExamServices,
    private mediaSoup: MediasoupService,
    private readonly attendanceService: AttendanceService,
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
  const { studentId, admin } = client.handshake.auth;

  if (studentId) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    client.data.studentId = studentId;
    console.log("🎓 Student connected:", studentId);
  }

  if (admin) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    client.data.admin = true;
    console.log("👑 Admin connected");
  }
}
  // ✅ When a socket disconnects
async handleDisconnect(client: Socket) {
  // eslint-disable-next-line prefer-const
  let { studentId, admin } = client.data || {};
  console.log('📤 handleDisconnect fired with data:', client.data);
 if (!studentId) {
    for (const [id, socket] of this.studentSockets.entries()) {
      if (socket.id === client.id) {
        studentId = id;
        break;
      }
    }
  }

  console.log('📤 handleDisconnect resolved studentId:', studentId);
  if (studentId) {
  this.studentSockets.delete(studentId);

  console.log(`🧹 Removing producers for ${studentId} (disconnect)`);
  this.mediaSoup.removeProducersByStudent(studentId);

  // ✅ NEW: tell admin media is gone
  this.server.to('admin-room').emit('student-media-closed', {
    studentId,
  });

  await this.reconcileStudentState(studentId);

  if (await this.redis.isAdminOnline()) {
    const snapshot = await this.buildEnrichedSnapshot();
    this.server.to('admin-room').emit('attendance-update', snapshot);
  }

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

    // 1️⃣ Fetch all students in Redis
    const connectedStudentIds = this.getConnectedStudents();

const snapshot = await this.redis.getAttendanceSnapshot();

const ghosts = snapshot
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  .map((s) => s.studentId)
  .filter((id) => !connectedStudentIds.includes(id));

for (const studentId of ghosts) {
  await this.reconcileStudentState(studentId);
}

    // 5️⃣ Final accurate snapshot for admin
    const finalSnapshot = await this.buildEnrichedSnapshot();
    client.emit('attendance-snapshot', finalSnapshot);
  }

  // ✅ STUDENT STARTS EXAM
  // ✅ STUDENT JOIN EXAM
@SubscribeMessage('student-join')
async studentJoin(@MessageBody() data, @ConnectedSocket() client) {
  const { examId, studentId } = data;

  this.studentSockets.set(studentId, client);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  client.data.studentId = studentId;

  // 🔥 NEW: reset media when switching exam
  this.mediaSoup.removeProducersByStudent(studentId);

  this.server.to('admin-room').emit('student-media-closed', {
    studentId,
  });

  await this.reconcileStudentState(studentId);

  await this.redis.setAttendance(studentId, {
    studentId,
    examId,
    active: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  client.join(`exam-${examId}`);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  client.join(`student-room-${studentId}`);

  if (await this.redis.isAdminOnline()) {
    const snapshot = await this.buildEnrichedSnapshot();

    this.server.to('admin-room').emit('attendance-update', snapshot);

    this.server.to('admin-room').emit('student-switched-exam', {
      studentId,
      examId,
    });
  }

  return { ok: true };
}
private async buildEnrichedSnapshot() {
  return this.attendanceService.buildEnrichedSnapshot();
}  // ✅ STUDENT LIVE STATUS UPDATE
 @SubscribeMessage('student-status')
async studentStatus(@MessageBody() data, @ConnectedSocket() client: Socket) {
  const { studentId, examId } = data;

  // 1️⃣ Update Redis with latest student status
  await this.redis.setAttendance(studentId, data);

  // 2️⃣ Update in-memory map with the latest socket
  // ✅ This ensures that even if the student reconnects, we have their current socket
  this.studentSockets.set(studentId, client);

 // 3️⃣ Send updates to invigilator (teacher) room
  /*const roomId = await this.redis.getRoomByExam(examId);
  if (roomId === null) {
    throw new Error("invalid room id");
  }*/

  /*const student_invigilator = await this.redis.getInvigilatorByStudent(roomId, studentId);
  console.log(`⏳ Updated status for ${studentId} in exam ${examId}`);
  this.server.to(`${student_invigilator}_room`).emit('student-update', data);*/

  // 4️⃣ Admin snapshot update
  if (await this.redis.isAdminOnline()) {
    this.server.to('admin-room').emit('attendance-update', await this.buildEnrichedSnapshot());
  }
}
private async cleanupGhostStudents() {
  const snapshot = await this.redis.getAttendanceSnapshot();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  const redisStudentIds = snapshot.map((s) => s.studentId);

  const connectedStudentIds = this.getConnectedStudents();

  const ghosts = redisStudentIds.filter(
    (id) => !connectedStudentIds.includes(id),
  );

  if (ghosts.length === 0) return;

  //console.log(`👻 Cleaning ghost students:`, ghosts);

  for (const studentId of ghosts) {
    await this.reconcileStudentState(studentId);
  }
}
  // ✅ ADMIN STOPS ONE STUDENT
@SubscribeMessage('admin-stop-exam')
async stopExam(@MessageBody() data: { studentId: string; examId: number }) {
  const { studentId, examId } = data;

  console.log(`🛑 Admin stopping ${studentId} for exam ${examId}`);

  await this.redis.removeStudent(studentId, examId);

  await this.reconcileStudentState(studentId);

  // ✅ ONLY notify student
  const socket = this.studentSockets.get(studentId);

  if (socket) {
    socket.emit('force-stop', { studentId, examId });
  } else {
    this.server.to(`student-room-${studentId}`).emit('force-stop', { studentId, examId });
  }

  if (await this.redis.isAdminOnline()) {
    const snapshot = await this.buildEnrichedSnapshot();
    console.log('updated snapshot:',snapshot)
    this.server.to('admin-room').emit('attendance-update', snapshot);
  }

  this.server.to('admin-room').emit('student-stopped', { studentId, examId });
}
private async reconcileStudentState(studentId: string, timeLeft?: number) {
  const studentExams = await this.redis.getStudent(studentId);

  if (!studentExams || !Array.isArray(studentExams)) {
    return { remaining: [], isFullyInactive: true };
  }

  for (const exam of studentExams) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    const examDetail = await this.exam.findOne(exam.examId);
    if (!examDetail) continue;

    const totalQuestions = examDetail.totalQuestions;

    const finished = await this.redis.removeStudentIfFinished(
      studentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      exam.examId,
      totalQuestions,
    );

    if (!finished) {
      await this.redis.setAttendance(studentId, {
        ...exam,
        active: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        timeLeft: exam.timeLeft ?? timeLeft,
      });
    }
  }

  const remaining = await this.redis.getStudent(studentId);

  return {
    remaining: remaining ?? [],
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    isFullyInactive: !remaining || remaining.length === 0,
  };
}

  // ✅ STUDENT LEAVES EXPLICITLY (submit)

@SubscribeMessage('student-leave')
async handleStudentLeave(
  @MessageBody() data: { studentId: string; timeLeft: number, examId: number },
  @ConnectedSocket() client: Socket,
) {
  const { studentId, timeLeft, examId } = data;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  client.data.studentId = studentId;

  console.log(`👋 Student-leave received for ${examId}`);
await this.redis.removeStudent(studentId, examId);
  await this.reconcileStudentState(studentId, timeLeft);
this.mediaSoup.removeProducersByStudent(studentId);

this.server.to('admin-room').emit('student-media-closed', {
  studentId,
});
  await this.cleanupGhostStudents();

  if (await this.redis.isAdminOnline()) {
    const finalSnapshot = await this.buildEnrichedSnapshot();
    this.server.to('admin-room').emit('attendance-update', finalSnapshot);
  }

  this.server.to('admin-room').emit('student-left', { studentId });

  // ✅ Let frontend decide to disconnect OR keep alive
  // ❌ DO NOT force disconnect unless necessary
  // client.disconnect();

  return { ok: true };
}
}
