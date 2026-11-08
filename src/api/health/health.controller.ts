import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PostgresHealthIndicator } from '@infrastructure/observability/health/postgres.health.indicator';
import { SqsHealthIndicator } from '@infrastructure/observability/health/sqs.health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly postgresHealth: PostgresHealthIndicator,
    private readonly sqsHealth: SqsHealthIndicator,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  getLive(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async getReady(): Promise<{ status: string; dependencies: Record<string, string> }> {
    const [postgres, sqs] = await Promise.all([
      this.postgresHealth.isHealthy(),
      this.sqsHealth.isHealthy(),
    ]);

    const dependencies: Record<string, string> = {};
    if (postgres.detail) {
      Object.assign(dependencies, postgres.detail);
    }
    if (sqs.detail) {
      Object.assign(dependencies, sqs.detail);
    }

    const allHealthy = postgres.status === 'up' && sqs.status === 'up';
    if (!allHealthy) {
      const errors: string[] = [];
      if (postgres.error) errors.push(postgres.error);
      if (sqs.error) errors.push(sqs.error);
      throw new ServiceUnavailableException({
        status: 'error',
        dependencies,
        errors,
      });
    }

    return {
      status: 'ok',
      dependencies,
    };
  }
}
