import { Injectable, Inject, Optional } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { getMikroORMToken } from '@mikro-orm/nestjs';

export interface HealthIndicatorResult {
  status: 'up' | 'down';
  detail?: Record<string, string>;
  error?: string;
}

@Injectable()
export class PostgresHealthIndicator {
  constructor(
    @Optional()
    @Inject(getMikroORMToken('default'))
    private readonly orm?: MikroORM,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      if (!this.orm) {
        return {
          status: 'down',
          detail: { postgresql: 'not_configured' },
          error: 'MikroORM not configured',
        };
      }
      await this.orm.getConnection().execute('SELECT 1');
      return {
        status: 'up',
        detail: { postgresql: 'ok' },
      };
    } catch (error) {
      return {
        status: 'down',
        detail: { postgresql: 'error' },
        error: error instanceof Error ? error.message : 'PostgreSQL connection failed',
      };
    }
  }
}
