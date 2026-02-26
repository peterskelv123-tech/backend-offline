import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import os from 'os';
//import { types as mediasoupTypes } from 'mediasoup';
@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker: mediasoup.types.Worker;
  private router: mediasoup.types.Router;
  private announcedIp: string;
  private producerTransports = new Map<
    string,
    mediasoup.types.WebRtcTransport
  >();
  private consumerTransports = new Map<
    string,
    mediasoup.types.WebRtcTransport
  >();
  private producers = new Map<
    string,
    {
      producer: mediasoup.types.Producer;
      studentId: string;
      kind: 'audio' | 'video';
    }
  >();
  private consumers = new Map<string, mediasoup.types.Consumer>();
  async onModuleInit() {
    this.worker = await mediasoup.createWorker();
    this.announcedIp = this.getLocalIp();
    console.log('📡 mediasoup announcedIp:', this.announcedIp);
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
      listenIps: [{ ip: '0.0.0.0', announcedIp: this.announcedIp }],
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
    studentId: string,
  ) {
    const transport = this.producerTransports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const producer = await transport.produce({ kind, rtpParameters });

    this.producers.set(producer.id, {
      producer,
      studentId,
      kind,
    });

    return { producerId: producer.id };
  }
  getAllProducers() {
    return [...this.producers.entries()].map(([producerId, data]) => ({
      producerId,
      studentId: data.studentId,
      kind: data.kind,
    }));
  }
  // -------------------- PRODUCER CLEANUP --------------------
  removeProducersByStudent(studentId: string) {
    for (const [producerId, data] of this.producers.entries()) {
      if (data.studentId === studentId) {
        console.log(
          `🧹 Closing producer ${producerId} (${data.kind}) for student ${studentId}`,
        );

        try {
          data.producer.close(); // 🔥 THIS IS THE REAL KILL SWITCH
        } catch (err) {
          console.warn('⚠️ Error closing producer:', producerId, err);
        }

        this.producers.delete(producerId);
      }
    }
  }
  // -------------------- CONSUMER TRANSPORT --------------------
  async createConsumerTransport(): Promise<any> {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: this.announcedIp }],
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
      paused: true, // IMPORTANT: stay paused
    });

    consumer.on('producerclose', () => {
      console.log('Producer closed:', producerId);
      this.consumers.delete(consumer.id);
    });

    // Store consumer so we can resume later
    this.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerId,
    };
  }
  async resumeConsumer(consumerId: string) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.resume();
  }
  private getLocalIp() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (
          net.family === 'IPv4' &&
          !net.internal &&
          name.toLowerCase().includes('wi')
        ) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }
  getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }
}
