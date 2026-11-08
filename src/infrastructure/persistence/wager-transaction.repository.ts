import { EntityRepository } from '@mikro-orm/core';
import { WagerTransactionEntity } from './wager-transaction.entity';

export class WagerTransactionRepository extends EntityRepository<WagerTransactionEntity> {
  async findById(transactionId: string): Promise<WagerTransactionEntity | null> {
    return this.findOne({ id: transactionId });
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransactionEntity | null> {
    return this.findOne({ providerId, externalTransactionId });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransactionEntity | null> {
    return this.findOne({ idempotencyKey });
  }

  async findByPayloadHash(payloadHash: string): Promise<WagerTransactionEntity | null> {
    return this.findOne({ payloadHash });
  }

  async create(transaction: WagerTransactionEntity): Promise<void> {
    this.em.persist(transaction);
    await this.em.flush();
  }

  async update(transaction: WagerTransactionEntity): Promise<void> {
    this.em.persist(transaction);
    await this.em.flush();
  }
}
