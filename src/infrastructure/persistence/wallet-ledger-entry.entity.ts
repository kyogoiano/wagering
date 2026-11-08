import { Entity, PrimaryKey, Property, Index, Unique, Check } from '@mikro-orm/core';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({ properties: ['transactionId'] })
@Check('direction IN (\'DEBIT\', \'CREDIT\')')
@Check('amount >= 0')
@Check('balance_before >= 0')
@Check('balance_after >= 0')
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  walletId!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  transactionId!: string;

  @Property({ type: 'string', length: 6 })
  direction!: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  amount!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  balanceBefore!: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  balanceAfter!: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
