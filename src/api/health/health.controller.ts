import { Controller, Get, HttpCode, HttpStatus, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PostgresHealthIndicator } from '@infrastructure/observability/health/postgres.health.indicator';
import { SqsHealthIndicator } from '@infrastructure/observability/health/sqs.health.indicator';
import { Public } from '@auth/decorators/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly postgresHealth: PostgresHealthIndicator,
    @Optional()
    private readonly sqsHealth: SqsHealthIndicator | null,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  getLive(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async getReady(): Promise<{ status: string; dependencies: Record<string, string>; errors?: string[] }> {
    const postgres = await this.postgresHealth.isHealthy();
    const sqs = this.sqsHealth
      ? await this.sqsHealth.isHealthy()
      : { status: 'down', detail: { sqs: 'not_configured' }, error: 'SQS client not available' };

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
