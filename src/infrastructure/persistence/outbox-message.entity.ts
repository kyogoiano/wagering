import { Entity, PrimaryKey, Property, Index, Check } from '@mikro-orm/core';

@Entity({ tableName: 'outbox_messages' })
@Check(
  "(published_at IS NULL AND attempts < 5) OR (published_at IS NOT NULL)",
  'chk_outbox_pending',
)
export class OutboxMessageEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  aggregateId!: string;

  @Property({ type: 'string', length: 100 })
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  occurredAt!: Date;

  @Property({ type: 'int', default: 0 })
  attempts!: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  @Index({ where: 'published_at IS NULL' })
  nextAttemptAt!: Date;

  @Property({ type: 'datetime', nullable: true })
  publishedAt?: Date;
}
