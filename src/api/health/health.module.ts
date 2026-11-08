import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from '@infrastructure/observability/health/postgres.health.indicator';
import { SqsHealthIndicator } from '@infrastructure/observability/health/sqs.health.indicator';

@Module({
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, SqsHealthIndicator],
})
export class HealthModule {}
