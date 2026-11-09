import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { InboxMessageRepository } from '@infrastructure/persistence/inbox-message.repository';
import { TransactionService, SubmitTransactionInput } from '@application/wager/transaction.service';
import { SQS_CLIENT_TOKEN } from '../sqs.tokens';

const SQS_CONSUMER_CONFIG_TOKEN = 'SQS_CONSUMER_CONFIG_TOKEN';
import { InsufficientBalanceError, InvalidAmountError, InvalidCurrencyError, InvalidTransactionStateError, ReferenceNotFoundError, WalletNotFoundError, WalletAlreadyExistsError } from '@domain/errors/domain.error';

interface SqsConsumerConfig {
  queueName: string;
  consumerName: string;
  visibilityTimeoutSeconds: number;
  pollingIntervalMs: number;
}

interface SqsMessage {
  messageId: string;
  type: string;
  occurredAt: string;
  data: SubmitTransactionInput;
}

const BUSINESS_ERRORS = [
  InsufficientBalanceError,
  InvalidAmountError,
  InvalidCurrencyError,
  InvalidTransactionStateError,
  ReferenceNotFoundError,
  WalletNotFoundError,
  WalletAlreadyExistsError,
];

function isBusinessError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return BUSINESS_ERRORS.some((BizError) => error instanceof BizError);
}

@Injectable()
export class SqsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(SqsConsumerService.name);
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private shuttingDown = false;
  private activeMessages = 0;

  constructor(
    @Inject(SQS_CLIENT_TOKEN)
    private readonly sqsClient: SQSClient,
    @Inject(SQS_CONSUMER_CONFIG_TOKEN)
    private readonly config: SqsConsumerConfig,
    private readonly inboxRepository: InboxMessageRepository,
    private readonly transactionService: TransactionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(`Starting SQS consumer for queue: ${this.config.queueName}`);
    this.startPolling();
  }

  startPolling(): void {
    this.pollingTimer = setInterval(() => {
      if (!this.shuttingDown) {
        this.poll().catch((err) => {
          this.logger.error(`Polling error: ${err.message}`, err.stack);
        });
      }
    }, this.config.pollingIntervalMs);
    // Make timer unref so it doesn't keep the process alive
    if (this.pollingTimer.unref) {
      this.pollingTimer.unref();
    }
  }

  async shutdown(): Promise<void> {
    this.logger.log('Shutting down SQS consumer...');
    this.shuttingDown = true;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    // Wait for active messages to complete
    const maxWaitMs = 10_000;
    const startTime = Date.now();
    while (this.activeMessages > 0 && Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.activeMessages > 0) {
      this.logger.warn(`Still ${this.activeMessages} active messages after timeout — messages will be redelivered`);
    } else {
      this.logger.log('SQS consumer shut down gracefully');
    }
  }

  async poll(): Promise<void> {
    try {
      const queueUrl = await this.getQueueUrl();
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 5,
        VisibilityTimeout: this.config.visibilityTimeoutSeconds,
      });

      const response = await this.sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        return;
      }

      for (const message of response.Messages) {
        await this.processMessage(message);
      }
    } catch (error) {
      this.logger.error(`SQS poll error: ${(error as Error).message}`);
    }
  }

  async processMessage(message: any): Promise<void> {
    const messageId = message.MessageId;
    const body = message.Body;
    const receiptHandle = message.ReceiptHandle;
    const queueUrl = message.QueueUrl || (await this.getQueueUrl());

    this.activeMessages++;

    try {
      // Deserialize message
      const sqsMessage: SqsMessage = JSON.parse(body);

      // Check inbox for deduplication
      const alreadyProcessed = await this.inboxRepository.findByMessageId(
        this.config.consumerName,
        messageId,
      );

      if (alreadyProcessed) {
        this.logger.debug(`Message ${messageId} already processed — deduplicating`);
        await this.ackMessage(queueUrl, receiptHandle);
        return;
      }

      // Process transaction using the same service as HTTP
      const input: SubmitTransactionInput = sqsMessage.data;
      const result = await this.transactionService.submit(input);

      // Register inbox in the same transaction
      await this.inboxRepository.markAsProcessed(
        this.config.consumerName,
        messageId,
        new Date(sqsMessage.occurredAt),
      );

      // Ack message after successful commit
      await this.ackMessage(queueUrl, receiptHandle);

      this.logger.log(
        `Message ${messageId} processed successfully — transaction: ${result.transactionId}`,
      );
    } catch (error) {
      const err = error as Error;

      if (isBusinessError(error)) {
        // Business error — terminal state, ack the message (no retry)
        this.logger.warn(
          `Message ${messageId} failed with business error: ${err.message} — acking without retry`,
        );
        await this.ackMessage(queueUrl, receiptHandle);
      } else {
        // Infrastructure error — leave message in queue (visibility timeout controls retry)
        this.logger.error(
          `Message ${messageId} failed with infrastructure error: ${err.message} — will retry`,
        );
      }
    } finally {
      this.activeMessages--;
    }
  }

  async ackMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  async getQueueUrl(): Promise<string> {
    const { GetQueueUrlCommand } = await import('@aws-sdk/client-sqs');
    const result = await this.sqsClient.send(
      new GetQueueUrlCommand({ QueueName: this.config.queueName }),
    );
    return result.QueueUrl!;
  }
}
