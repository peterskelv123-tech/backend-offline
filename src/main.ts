import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
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
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.log(`Server running on port ${port}`);
}
bootstrap();
