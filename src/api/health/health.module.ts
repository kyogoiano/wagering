import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from '@infrastructure/observability/health/postgres.health.indicator';

@Module({
  controllers: [HealthController],
  providers: [PostgresHealthIndicator],
})
export class HealthModule {}
