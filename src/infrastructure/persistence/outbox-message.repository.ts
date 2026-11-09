import { EntityRepository } from '@mikro-orm/core';
import { OutboxMessageEntity } from './outbox-message.entity';

export class OutboxMessageRepository extends EntityRepository<OutboxMessageEntity> {
  async findPendingDue(now: Date = new Date(), limit: number = 50): Promise<OutboxMessageEntity[]> {
    return this.find(
      {
        publishedAt: null,
        nextAttemptAt: { $lte: now },
      },
      {
        limit,
        orderBy: { occurredAt: 'ASC' },
      },
    );
  }

  async findPendingDueForUpdate(now: Date = new Date(), limit: number = 50): Promise<OutboxMessageEntity[]> {
    // Use raw query with SKIP LOCKED for concurrent worker safety
    const result = await this.em.getConnection().execute(
      `SELECT * FROM outbox_messages 
       WHERE published_at IS NULL AND next_attempt_at <= $1 
       ORDER BY occurred_at LIMIT $2 
       FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );
    return result.map((row: any) => {
      const entity = this.em.create(OutboxMessageEntity, row);
      return entity;
    });
  }

  async markAsPublished(message: OutboxMessageEntity): Promise<void> {
    message.publishedAt = new Date();
    this.em.persist(message);
    await this.em.flush();
  }

  async retryLater(
    message: OutboxMessageEntity,
    attempts: number,
    nextAttemptAt: Date,
  ): Promise<void> {
    message.attempts = attempts;
    message.nextAttemptAt = nextAttemptAt;
    this.em.persist(message);
    await this.em.flush();
  }
}
