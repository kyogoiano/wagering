import { Injectable, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { HealthIndicatorResult } from './postgres.health.indicator';
import { SQS_CLIENT_TOKEN } from '@infrastructure/messaging/sqs/sqs.tokens';

@Injectable()
export class SqsHealthIndicator {
  constructor(
    @Optional()
    @Inject(SQS_CLIENT_TOKEN)
    private readonly sqsClient: SQSClient | undefined,
    private readonly configService: ConfigService,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      if (!this.sqsClient) {
        return {
          status: 'down',
          detail: { sqs: 'not_configured' },
          error: 'SQS client not available',
        };
      }
      const queueName = this.configService.get<string>('sqs.queueName', 'wager-transactions.fifo');
      await this.sqsClient.send(
        new GetQueueUrlCommand({ QueueName: queueName }),
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
