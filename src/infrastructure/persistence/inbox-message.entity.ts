import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'inbox_messages' })
export class InboxMessageEntity {
  @PrimaryKey({ type: 'string', length: 255 })
  messageId!: string;

  @PrimaryKey({ type: 'string', length: 255 })
  consumerName!: string;

  @Property({ type: 'string', length: 64 })
  payloadHash!: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  receivedAt!: Date;

  @Property({ type: 'datetime', nullable: true })
  processedAt?: Date;
}
