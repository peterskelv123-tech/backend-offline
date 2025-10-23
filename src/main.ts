import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000', // React local dev
      'http://10.77.189.170:3000', // LAN access if you're testing via IP
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true, // if you plan to use cookies or auth later
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // ✅ enables automatic DTO conversion
      whitelist: true,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server running on port ${port}`);
}
bootstrap();
