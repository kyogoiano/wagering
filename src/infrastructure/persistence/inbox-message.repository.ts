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
    const entity = new this.class;
    entity.messageId = messageId;
    entity.consumerName = consumerName;
    entity.payloadHash = payloadHash;
    entity.receivedAt = occurredAt;
    entity.processedAt = new Date();
    this.em.persist(entity);
    await this.em.flush();
  }
}
