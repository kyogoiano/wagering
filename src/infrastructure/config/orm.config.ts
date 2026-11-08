import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { WalletEntity } from '../persistence/wallet.entity';
import { WagerTransactionEntity } from '../persistence/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../persistence/wallet-ledger-entry.entity';

export const ormConfig = {
  type: 'postgresql' as const,
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  dbName: process.env.DB_NAME || 'jungle',
  entities: [WalletEntity, WagerTransactionEntity, WalletLedgerEntryEntity],
  debug: process.env.NODE_ENV !== 'production',
};
