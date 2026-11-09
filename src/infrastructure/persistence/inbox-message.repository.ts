import { EntityRepository } from '@mikro-orm/core';
import { InboxMessageEntity } from './inbox-message.entity';

export class InboxMessageRepository extends EntityRepository<InboxMessageEntity> {
  async findByMessageId(consumerName: string, messageId: string): Promise<InboxMessageEntity | null> {
    return this.findOne({ consumerName, messageId });
  }

  async markAsProcessed(
    consumerName: string,
    messageId: string,
    occurredAt: Date,
    payloadHash: string = '',
  ): Promise<void> {
    const existing = await this.findByMessageId(consumerName, messageId);
    if (existing) {
      existing.processedAt = new Date();
      return;
    }
    const entity = this.em.create(InboxMessageEntity, {
      messageId,
      consumerName,
      payloadHash,
      receivedAt: occurredAt,
      processedAt: new Date(),
    });
    this.em.persist(entity);
    await this.em.flush();
  }
}
