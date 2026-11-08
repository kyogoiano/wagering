import { Module, Global, DynamicModule } from '@nestjs/common';
import { PinoLoggerService } from './pino-logger.service';

@Global()
@Module({})
export class LoggingModule {
  static forRoot(): DynamicModule {
    return {
      module: LoggingModule,
      providers: [PinoLoggerService],
      exports: [PinoLoggerService],
    };
  }
}
