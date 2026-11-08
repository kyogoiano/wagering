import { Entity, PrimaryKey, Property, Index, Unique } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallets' })
@Unique({ properties: ['playerId', 'currency'] })
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  playerId!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'decimal', precision: 20, scale: 2, default: '0' })
  balanceAmount!: string;

  @Property({ type: 'int', default: 0 })
  version!: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'datetime', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date;
}
