import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../Redis.service';

@WebSocketGateway({
  namespace: '/students',
  cors: { origin: '*' },
})
export class StudentStrCtrlGateway {
  @WebSocketServer()
  server: Server;

  constructor(private redis: RedisService) {}

  @SubscribeMessage('student-stream')
  async streamExam(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      studentId: string;
      examId: number;
      kind: 'video' | 'audio' | 'screen';
      chunk: any;
    },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { studentId, examId, kind, chunk } = data;

    if (!studentId || !examId || !chunk) return;

    // 1️⃣ Get room from exam (YOU ALREADY HAVE THIS)
    const roomId = await this.redis.getRoomByExam(examId);
    if (!roomId) return;

    // 2️⃣ Get assigned invigilator for this student in this room
    const invigilatorId = await this.redis.getInvigilatorByStudent(
      roomId,
      studentId,
    );
    if (!invigilatorId) return;

    // 3️⃣ Relay media to invigilator room
    this.server.to(`${invigilatorId}_room`).emit('student-stream', {
      studentId,
      examId,
      kind,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      chunk,
      ts: Date.now(),
    });
  }
}
