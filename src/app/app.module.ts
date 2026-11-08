import { Module, ValidationPipe, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '@auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { LoggingModule } from '@infrastructure/observability/logging/logging.module';
import { MetricsModule } from '@infrastructure/observability/metrics/metrics.module';
import { HealthModule } from '@api/health/health.module';
import { WalletsModule } from '@api/wallets/wallets.module';
import { WageringModule } from '@api/wagering/wagering.module';
import { ReconciliationModule } from '@api/reconciliation/reconciliation.module';
import { CorrelationIdInterceptor } from '@api/common/interceptors/correlation-id.interceptor';
import { HttpMetricsMiddleware } from '@infrastructure/observability/metrics/http-metrics.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AuthModule,
    PersistenceModule.forRoot(),
    LoggingModule.forRoot(),
    MetricsModule.forRoot(),
    HealthModule,
    WalletsModule,
    WageringModule,
    ReconciliationModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        disableErrorMessages: false,
      }),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
