import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from 'src/mediaSoup/mediaSoupService';
import { AttendanceService } from '../AttendanceService';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket'],
})
export class MediaGateway {
  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly mediasoup: MediasoupService,
    private attendanceService: AttendanceService,
  ) {}

  // --------------------------------------------------
  // Health check
  // --------------------------------------------------
  @SubscribeMessage('ping')
  handlePing() {
    console.log('🏓 ping received');
    return 'pong';
  }

  // --------------------------------------------------
  // Router RTP capabilities
  // --------------------------------------------------
  @SubscribeMessage('get-rtp-capabilities')
  handleGetRtpCapabilities() {
    console.log('🎯 get-rtp-capabilities called');
    const caps = this.mediasoup.getRouterRtpCapabilities();
    console.log('🎯 RTP Capabilities:', caps);
    return caps;
  }

  // --------------------------------------------------
  // STUDENT — Send transport
  // --------------------------------------------------
  @SubscribeMessage('createTransport')
  async handleCreateTransport() {
    console.log('🛠 createTransport called');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const transport = await this.mediasoup.createTransport();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('🛠 Send transport created:', transport.id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return transport;
  }

  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; dtlsParameters: any },
    @Ack() ack: (response?: any) => void,
  ) {
    console.log('🔗 connectTransport called', client.id, data.transportId);

    if (!data?.transportId || !data?.dtlsParameters) {
      console.warn('⚠️ Invalid connectTransport payload', data);
      return ack({ ok: false, error: 'Missing transportId or dtlsParameters' });
    }

    try {
      await this.mediasoup.connectTransport(
        data.transportId,
        data.dtlsParameters,
      );
      console.log('✅ Send transport connected:', data.transportId);
      ack({ ok: true });
    } catch (err) {
      console.error('❌ connectTransport failed:', err);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      ack({ ok: false, error: err?.message || 'Transport connection error' });
    }
  }
  @SubscribeMessage('admin-join')
  handleAdminJoin(@ConnectedSocket() socket: Socket) {
    socket.join('admin-room');
    console.log('👑 Admin joined admin-room:', socket.id);

    const producers = this.mediasoup.getAllProducers();

    for (const p of producers) {
      socket.emit('new-student-producer', {
        studentId: p.studentId,
        producerId: p.producerId,
        kind: p.kind,
      });
    }
  }
  @SubscribeMessage('student-produce')
  async handleStudentProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      transportId: string;
      kind: 'video' | 'audio';
      rtpParameters: any;
      studentId: string;
    },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { studentId, kind, transportId, rtpParameters } = data;

    console.log('🎬 student-produce:', {
      socket: client.id,
      studentId,
      kind,
    });

    // ✅ Produce (this now handles replacement internally)
    const { producerId } = await this.mediasoup.produce(
      transportId,
      kind,
      rtpParameters,
      studentId,
    );

    console.log(
      `🎬 Active producer → ${producerId} (${kind}) for ${studentId}`,
    );

    // ✅ 🔥 Notify admins with SPECIFIC event (NOT snapshot)
    this.server.to('admin-room').emit('new-student-producer', {
      studentId,
      producerId,
      kind,
    });

    return { producerId };
  }
  // --------------------------------------------------
  // ADMIN — Consumer transport
  // --------------------------------------------------
  @SubscribeMessage('createConsumerTransport')
  async handleCreateConsumerTransport(@ConnectedSocket() client: Socket) {
    console.log('🛠 createConsumerTransport called by admin:', client.id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const transport = await this.mediasoup.createConsumerTransport();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('🛠 Consumer transport created:', transport.id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return transport;
  }

  @SubscribeMessage('connectConsumerTransport')
  async handleConnectConsumerTransport(
    @MessageBody() data: { transportId: string; dtlsParameters: any },
    @Ack() ack: (response?: any) => void,
  ) {
    try {
      await this.mediasoup.connectConsumerTransport(
        data.transportId,
        data.dtlsParameters,
      );

      ack({ ok: true });
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      ack({ ok: false, error: err.message });
    }
  }
  @SubscribeMessage('resume-consumer')
  async handleResumeConsumer(
    @MessageBody() data: { consumerId: string },
    @Ack() ack: (response?: any) => void,
  ) {
    try {
      await this.mediasoup.resumeConsumer(data.consumerId);
      ack({ ok: true });
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      ack({ ok: false, error: err.message });
    }
  }
  // --------------------------------------------------
  // ADMIN — Consume producer
  // --------------------------------------------------
  @SubscribeMessage('consume')
  async handleConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      transportId: string;
      producerId: string;
      rtpCapabilities: any;
    },
  ) {
    console.log('👀 consume called:', {
      admin: client.id,
      transportId: data.transportId,
      producerId: data.producerId,
    });

    const consumer = await this.mediasoup.consume(
      data.transportId,
      data.producerId,
      data.rtpCapabilities,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    // await consumer.resume();
    console.log(
      `👀 Consumer created → id=${consumer.id}, kind=${consumer.kind}, producer=${consumer.producerId}`,
    );

    return consumer;
  }
}
