import { Injectable, Inject, Optional } from '@nestjs/common';
import { SQSClient, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { HealthIndicatorResult } from './postgres.health.indicator';

const SQS_CLIENT_TOKEN = 'SQS_CLIENT_TOKEN';

interface SqsHealthConfig {
  queueName: string;
}

@Injectable()
export class SqsHealthIndicator {
  constructor(
    @Optional()
    @Inject(SQS_CLIENT_TOKEN)
    private readonly sqsClient: SQSClient | undefined,
    @Optional()
    private readonly config: SqsHealthConfig | undefined,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      if (!this.sqsClient || !this.config) {
        return {
          status: 'down',
          detail: { sqs: 'not_configured' },
          error: 'SQS client not available',
        };
      }
      await this.sqsClient.send(
        new GetQueueUrlCommand({ QueueName: this.config.queueName }),
      );
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
