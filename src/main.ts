import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { PinoLoggerService } from '@infrastructure/observability/logging/pino-logger.service';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
class GlobalExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: any) {
    const request = host.switchToHttp().getRequest();
    const response = host.switchToHttp().getResponse();

    let status: number;
    let message: string;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      message = typeof resp === 'string' ? resp : (resp as any).message || exception.message;
      stack = exception.stack;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = (exception as Error).message || 'Internal server error';
      stack = (exception as Error).stack;
    }

    const logger = new Logger('GlobalExceptionFilter');
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      logger.error(
        `Unhandled exception: ${message}`,
        stack,
        `${request.method} ${request.url}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : message,
      path: request.url,
    });
  }
}

async function bootstrap() {
  const pinoLogger = new PinoLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger: pinoLogger,
  });

  app.useGlobalFilters(new GlobalExceptionFilter(app.getHttpAdapter()));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  pinoLogger.log(`Jungle API running on port ${port}`, 'Bootstrap');
}

bootstrap();
