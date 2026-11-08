import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { PinoLoggerService } from '@infrastructure/observability/logging/pino-logger.service';

async function bootstrap() {
  const pinoLogger = new PinoLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger: pinoLogger,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  pinoLogger.log(`Jungle API running on port ${port}`, 'Bootstrap');
}

bootstrap();
