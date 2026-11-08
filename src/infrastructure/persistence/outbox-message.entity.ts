import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'outbox_messages' })
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
