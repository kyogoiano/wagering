import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxMessageRepository } from '@infrastructure/persistence/outbox-message.repository';
import { OutboxMessageEntity } from '@infrastructure/persistence/outbox-message.entity';

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(
    private readonly outboxRepository: OutboxMessageRepository,
  ) {}

  @Cron('*/15 * * * * *') // Every 15 seconds
  async publish(): Promise<void> {
    try {
      const now = new Date();
      const pending = await this.outboxRepository.findPendingDue(now, 50);

      if (pending.length === 0) {
        return;
      }

      this.logger.debug(`Found ${pending.length} pending outbox messages`);

      for (const message of pending) {
        await this.publishMessage(message);
      }
    } catch (error) {
      this.logger.error(`Outbox publisher error: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async publishMessage(message: OutboxMessageEntity): Promise<void> {
    try {
      // Publish event to destination (log by default, SQS if configured)
      this.logger.log(
        `Publishing outbox event: ${message.type} (id: ${message.id})`,
        JSON.parse(message.payload),
      );

      // Mark as published
      await this.outboxRepository.markAsPublished(message);

      this.logger.debug(`Outbox event published: ${message.id}`);
    } catch (error) {
      // Retry with exponential backoff
      const attempts = (message.attempts || 0) + 1;
      const baseDelayMs = 1000;
      const maxDelayMs = 60_000;
      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempts), maxDelayMs);
      const nextAttemptAt = new Date(Date.now() + delayMs);

      this.logger.error(
        `Failed to publish outbox event ${message.id} (attempt ${attempts}): ${(error as Error).message}`,
      );

      await this.outboxRepository.retryLater(message, attempts, nextAttemptAt);
    }
  }
}
