import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MikroORM } from '@mikro-orm/core';
import { OutboxMessageEntity } from '@infrastructure/persistence/outbox-message.entity';

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(private readonly orm: MikroORM) {}

  @Cron('*/15 * * * * *') // Every 15 seconds
  async publish(): Promise<void> {
    const em = this.orm.em.fork();
    try {
      const now = new Date();
      const pending = await em.find(
        OutboxMessageEntity,
        {
          publishedAt: null,
          nextAttemptAt: { $lte: now },
        },
        {
          limit: 50,
          orderBy: { occurredAt: 'ASC' },
        },
      );

      if (pending.length === 0) {
        return;
      }

      this.logger.debug(`Found ${pending.length} pending outbox messages`);

      for (const message of pending) {
        await this.publishMessage(em, message);
      }
    } catch (error) {
      this.logger.error(`Outbox publisher error: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async publishMessage(em: any, message: OutboxMessageEntity): Promise<void> {
    try {
      // Publish event to destination (log by default, SQS if configured)
      const payload = typeof message.payload === 'string' ? JSON.parse(message.payload) : message.payload;
      this.logger.log(
        `Publishing outbox event: ${message.eventType} (id: ${message.id})`,
        payload,
      );

      // Mark as published
      message.publishedAt = new Date();
      em.persist(message);
      await em.flush();

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

      message.attempts = attempts;
      message.nextAttemptAt = nextAttemptAt;
      em.persist(message);
      await em.flush();
    }
  }
}
