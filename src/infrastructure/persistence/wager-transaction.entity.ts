import { Entity, PrimaryKey, Property, Index, Unique, Check } from '@mikro-orm/core';

@Entity({ tableName: 'wager_transactions' })
@Unique({ properties: ['idempotencyKey'] })
@Unique({ properties: ['providerId', 'externalTransactionId'] })
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'string', length: 255 })
  @Index()
  providerId!: string;

  @Property({ type: 'string', length: 255 })
  externalTransactionId!: string;

  @Property({ type: 'string', length: 512 })
  idempotencyKey!: string;

  @Property({ type: 'string', length: 64 })
  payloadHash!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  walletId!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  playerId!: string;

  @Property({ type: 'string', length: 255 })
  roundId!: string;

  @Property({ type: 'string', length: 255 })
  gameId!: string;

  @Property({ type: 'string', length: 20 })
  kind!: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  moneyAmount!: string;

  @Property({ type: 'string', length: 3 })
  moneyCurrency!: string;

  @Property({ type: 'string', length: 255, nullable: true })
  referenceExternalTransactionId?: string;

  @Property({ type: 'string', length: 20, default: 'PENDING' })
  @Index()
  status!: string;

  @Property({ type: 'uuid', columnType: 'uuid', nullable: true })
  referenceTransactionId?: string;

  @Property({ type: 'string', length: 50, nullable: true })
  failureCode?: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'datetime', nullable: true })
  processedAt?: Date;
}
