import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from '@api/health/health.module';
import { WalletsModule } from '@api/wallets/wallets.module';
import { WageringModule } from '@api/wagering/wagering.module';
import { ReconciliationModule } from '@api/reconciliation/reconciliation.module';
import { CorrelationIdInterceptor } from '@api/common/interceptors/correlation-id.interceptor';

@Module({
  imports: [HealthModule, WalletsModule, WageringModule, ReconciliationModule],
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
export class AppModule {}
