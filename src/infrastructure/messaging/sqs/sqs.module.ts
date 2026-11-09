import { DynamicModule, Module, OnModuleInit, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SQSClient } from '@aws-sdk/client-sqs';
import sqsConfig from './sqs.config';
import { createSqsClient, ensureQueuesExist } from './sqs-client.factory';
import type { SqsConfig } from './sqs-client.factory';
import { SqsConsumerService } from './consumer/sqs-consumer.service';
import { OutboxPublisherWorker } from './outbox/outbox-publisher.worker';
import { SqsHealthIndicator } from '@infrastructure/observability/health/sqs.health.indicator';
import { TransactionService } from '@application/wager/transaction.service';
import { IdempotencyService } from '@application/idempotency/idempotency.service';
import { SQS_CLIENT_TOKEN } from './sqs.tokens';

const SQS_CONSUMER_CONFIG_TOKEN = 'SQS_CONSUMER_CONFIG_TOKEN';

@Global()
@Module({})
export class SqsModule implements OnModuleInit {
  private sqsClient: SQSClient | null = null;
  private config: SqsConfig | null = null;

  static forRoot(): DynamicModule {
    return {
      module: SqsModule,
      imports: [
        ConfigModule.forFeature(sqsConfig),
        ScheduleModule.forRoot(),
      ],
      providers: [
        {
          provide: SQS_CLIENT_TOKEN,
          useFactory: (configService: ConfigService) => {
            const config = configService.get<SqsConfig>('sqs');
            if (!config) {
              throw new Error('SQS configuration not found');
            }
            return createSqsClient(config);
          },
          inject: [ConfigService],
        },
        {
          provide: SQS_CONSUMER_CONFIG_TOKEN,
          useFactory: (configService: ConfigService) => {
            const config = configService.get<SqsConfig>('sqs');
            if (!config) {
              throw new Error('SQS configuration not found');
            }
            return {
              queueName: config.queueName,
              consumerName: config.consumerName,
              visibilityTimeoutSeconds: config.visibilityTimeoutSeconds,
              pollingIntervalMs: config.pollingIntervalMs,
            };
          },
          inject: [ConfigService],
        },
        SqsConsumerService,
        OutboxPublisherWorker,
        SqsHealthIndicator,
        TransactionService,
        IdempotencyService,
      ],
      exports: [SQS_CLIENT_TOKEN, SqsConsumerService, OutboxPublisherWorker, SqsHealthIndicator],
    };
  }

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<SqsConfig>('sqs') || null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config) {
      console.warn('SQS module: No SQS configuration found — skipping queue creation');
      return;
    }
    try {
      this.sqsClient = createSqsClient(this.config);
      await ensureQueuesExist(this.sqsClient, this.config);
    } catch (error) {
      console.warn(`SQS module: Could not create queues — ${(error as Error).message}`);
    }
  }
}

