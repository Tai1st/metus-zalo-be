import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  // Express's default body limit is 100kb — too small for bulk internal
  // calls from Next (e.g. caching hundreds of group thread names at once,
  // or a campaign's target list). Only Next ever calls this API.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });
  // Only the Next server talks to this API and it forwards the visitor's IP in
  // X-Forwarded-For, so rate limits apply per visitor instead of to the whole
  // site at once. Keep this port firewalled: with a trusted hop, a client that
  // reached it directly could spoof that header.
  app.set('trust proxy', Number(config.get('TRUST_PROXY_HOPS', 1)));
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API docs describe every route: dev only, unless explicitly enabled.
  if (
    config.get('NODE_ENV') !== 'production' ||
    config.get('ENABLE_DOCS') === 'true'
  ) {
    const swagger = new DocumentBuilder()
      .setTitle('Metus Zalo API')
      .setDescription('Đăng nhập và gói cước')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }

  const port = Number(config.get('PORT', 4000));
  await app.listen(port);
  console.log(
    `Metus Zalo API: http://localhost:${port}/api  (docs: /api/docs)`,
  );
}
void bootstrap();
