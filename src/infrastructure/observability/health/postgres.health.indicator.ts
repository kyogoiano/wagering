import { Injectable, Inject, Optional } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

export interface HealthIndicatorResult {
  status: 'up' | 'down';
  detail?: Record<string, string>;
  error?: string;
}

@Injectable()
export class PostgresHealthIndicator {
  constructor(
    @Optional()
    @Inject(EntityManager)
    private readonly em?: EntityManager,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      if (!this.em) {
        return {
          status: 'down',
          detail: { postgresql: 'not_configured' },
          error: 'EntityManager not configured',
        };
      }
      await this.em.getConnection().execute('SELECT 1');
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
