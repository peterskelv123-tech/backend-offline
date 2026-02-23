import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker: mediasoup.types.Worker;
  private router: mediasoup.types.Router;

  private producerTransports = new Map<
    string,
    mediasoup.types.WebRtcTransport
  >();
  private consumerTransports = new Map<
    string,
    mediasoup.types.WebRtcTransport
  >();
  private producers = new Map<string, mediasoup.types.Producer>();

  async onModuleInit() {
    this.worker = await mediasoup.createWorker();
    this.router = await this.worker.createRouter({
      mediaCodecs: [
        { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
      ],
    });
  }

  // -------------------- PRODUCER TRANSPORT --------------------
  async createTransport(): Promise<any> {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: 'YOUR_PUBLIC_IP' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    this.producerTransports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(transportId: string, dtlsParameters: any) {
    const transport = this.producerTransports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    await transport.connect({ dtlsParameters });
  }

  async produce(
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: any,
  ) {
    const transport = this.producerTransports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    console.log(
      `🎬 produce called — transportId: ${transportId}, kind: ${kind}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const producer = await transport.produce({ kind, rtpParameters });
    console.log(
      `✅ Producer created — id: ${producer.id}, kind: ${producer.kind}`,
    );
    this.producers.set(producer.id, producer);
    return { producerId: producer.id };
  }

  // -------------------- CONSUMER TRANSPORT --------------------
  async createConsumerTransport(): Promise<any> {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    this.consumerTransports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectConsumerTransport(transportId: string, dtlsParameters: any) {
    const transport = this.consumerTransports.get(transportId);
    if (!transport) throw new Error('Consumer transport not found');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    await transport.connect({ dtlsParameters });
  }

  async consume(transportId: string, producerId: string, rtpCapabilities: any) {
    const transport = this.consumerTransports.get(transportId);
    const producer = this.producers.get(producerId);

    if (!transport || !producer)
      throw new Error('Transport or producer not found');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    if (!this.router.canConsume({ producerId, rtpCapabilities }))
      throw new Error('Cannot consume');

    const consumer = await transport.consume({
      producerId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      rtpCapabilities,
      paused: false,
    });

    consumer.on('producerclose', () => console.log('Producer closed'));

    return {
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerId,
    };
  }

  getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }
}
