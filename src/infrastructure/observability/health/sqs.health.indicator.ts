import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from './postgres.health.indicator';

@Injectable()
export class SqsHealthIndicator {
  // SQS will be configured via MiniStack or AWS SDK in a later phase.
  // For now, this indicator checks if the SQS environment is configured.
  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      const queueUrl = process.env.SQS_QUEUE_URL;
      if (!queueUrl) {
        return {
          status: 'down',
          detail: { sqs: 'not_configured' },
          error: 'SQS_QUEUE_URL not configured',
        };
      }
      // In production this would call AWS SDK ListQueues or SendMessage
      // For now we consider it healthy if configured
      return {
        status: 'up',
        detail: { sqs: 'ok' },
      };
    } catch (error) {
      return {
        status: 'down',
        detail: { sqs: 'error' },
        error: error instanceof Error ? error.message : 'SQS connection failed',
      };
    }
  }
}
