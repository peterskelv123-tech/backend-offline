import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from 'src/mediaSoup/mediaSoupService';
import { RedisService } from '../Redis.service';

@WebSocketGateway({ cors: true })
export class MediaGateway {
  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly mediasoup: MediasoupService,
    private readonly redis: RedisService,
  ) {}

  @SubscribeMessage('ping')
  handlePing() {
    return 'pong';
  }

  @SubscribeMessage('createTransport')
  async handleCreateTransport() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    console.log('🛠 createTransport called');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment
    const transport = await this.mediasoup.createTransport();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('🛠 Transport created with ID:', transport.id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return transport;
  }

  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { transportId: string; dtlsParameters: any },
  ) {
    console.log(
      '🔗 connectTransport called for transportId:',
      data.transportId,
    );
    await this.mediasoup.connectTransport(
      data.transportId,
      data.dtlsParameters,
    );
    console.log('🔗 Transport connected:', data.transportId);
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
    console.log('🎬 student-produce called:', data);
    // Produce on server
    const { producerId } = await this.mediasoup.produce(
      data.transportId,
      data.kind,
      data.rtpParameters,
    );
    console.log(
      `🎬 Producer created: ${producerId} (${data.kind}) for student: ${data.studentId}`,
    );
    // Save producer in Redis
    await this.redis.addProducerToActiveExam(
      data.studentId,
      producerId,
      data.kind,
    );
    console.log('💾 Producer saved to Redis');
    // Notify all online admins
    const adminSockets = Array.from(
      this.server.sockets.sockets.values(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (s: Socket) => (s.data.admin === true ? s : null),
    ).filter(Boolean) as Socket[];
    console.log(
      '👨‍💻 Notifying admins, total admins online:',
      adminSockets.length,
    );
    for (const adminSocket of adminSockets) {
      // ✅ Admin should create consumer transport & then consume
      adminSocket.emit('new-student-producer', {
        studentId: data.studentId,
        producerId,
        kind: data.kind,
      });
      console.log(
        `📡 Notified admin socket: ${adminSocket.id} about producer ${producerId}`,
      );
    }

    return { producerId };
  }

  @SubscribeMessage('produce')
  async handleProduce(
    @ConnectedSocket() _client: Socket,
    @MessageBody()
    data: { transportId: string; kind: 'video' | 'audio'; rtpParameters: any },
  ) {
    console.log('🎥 produce called:', data);
    const result = await this.mediasoup.produce(
      data.transportId,
      data.kind,
      data.rtpParameters,
    );
    console.log('🎥 produce result:', result);
    return result;
  }
  @SubscribeMessage('consume')
  async handleConsume(
    @MessageBody()
    data: {
      transportId: string;
      producerId: string;
      rtpCapabilities: any;
    },
  ) {
    console.log('👀 consume called:', data);
    const result = await this.mediasoup.consume(
      data.transportId,
      data.producerId,
      data.rtpCapabilities,
    );
    console.log('👀 consume result:', result);
    return result;
  }
  @SubscribeMessage('createConsumerTransport')
  // eslint-disable-next-line @typescript-eslint/require-await
  async handleCreateConsumerTransport() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    console.log('🛠 createConsumerTransport called');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const transport = await this.mediasoup.createConsumerTransport();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('🛠 Consumer transport created with ID:', transport.id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return transport;
  }
  @SubscribeMessage('get-rtp-capabilities')
  handleGetRtpCapabilities() {
    console.log('🎯 get-rtp-capabilities called');
    return this.mediasoup.getRouterRtpCapabilities();
  }
  @SubscribeMessage('connectConsumerTransport')
  async handleConnectConsumerTransport(
    @MessageBody() data: { transportId: string; dtlsParameters: any },
  ) {
    console.log(
      '🔗 connectConsumerTransport called for transportId:',
      data.transportId,
    );
    await this.mediasoup.connectConsumerTransport(
      data.transportId,
      data.dtlsParameters,
    );
    console.log('🔗 Consumer transport connected:', data.transportId);
  }
}
