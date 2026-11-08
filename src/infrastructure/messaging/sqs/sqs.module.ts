import { DynamicModule, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SQSClient } from '@aws-sdk/client-sqs';
import sqsConfig from './sqs.config';
import { createSqsClient, ensureQueuesExist, SqsConfig } from './sqs-client.factory';
import { SqsConsumerService } from './consumer/sqs-consumer.service';
import { OutboxPublisherWorker } from './outbox/outbox-publisher.worker';
import { InboxMessageRepository } from '@infrastructure/persistence/inbox-message.repository';
import { OutboxMessageRepository } from '@infrastructure/persistence/outbox-message.repository';
import { TransactionService } from '@application/wager/transaction.service';
import { IdempotencyService } from '@application/idempotency/idempotency.service';

const SQS_CLIENT_TOKEN = 'SQS_CLIENT_TOKEN';

@Module({})
export class SqsModule implements OnModuleInit {
  private sqsClient: SQSClient | null = null;

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
          useFactory: (config: SqsConfig) => createSqsClient(config),
          inject: [sqsConfig.KEY],
        },
        SqsConsumerService,
        OutboxPublisherWorker,
        InboxMessageRepository,
        OutboxMessageRepository,
        TransactionService,
        IdempotencyService,
      ],
      exports: [SQS_CLIENT_TOKEN, SqsConsumerService, OutboxPublisherWorker],
    };
  }

  constructor(
    private readonly config: ConfigType<typeof sqsConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.sqsClient = createSqsClient(this.config);
      await ensureQueuesExist(this.sqsClient, this.config);
    } catch (error) {
      // If MiniStack is not available, skip queue creation
      // The consumer will retry on next poll
      console.warn(`SQS module: Could not create queues — ${(error as Error).message}`);
    }
  }
}

export { SQS_CLIENT_TOKEN };
