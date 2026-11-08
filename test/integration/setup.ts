// test/integration/setup.ts
// Shared test setup for integration and concurrency tests.
// Connects to the PostgreSQL test database and applies migrations.

import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { WalletEntity } from '../../src/infrastructure/persistence/wallet.entity';
import { WagerTransactionEntity } from '../../src/infrastructure/persistence/wager-transaction.entity';
import { WalletLedgerEntryEntity } from '../../src/infrastructure/persistence/wallet-ledger-entry.entity';
import { InboxMessageEntity } from '../../src/infrastructure/persistence/inbox-message.entity';
import { OutboxMessageEntity } from '../../src/infrastructure/persistence/outbox-message.entity';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TestConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
}

export const TEST_CONFIG: TestConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'wallet',
  password: process.env.DB_PASSWORD || 'wallet',
  dbName: process.env.DB_NAME || 'jungle_test',
};

let orm: MikroORM | null = null;

export async function initTestOrm(): Promise<MikroORM> {
  if (orm) {
    return orm;
  }
  orm = await MikroORM.init({
    ...TEST_CONFIG,
    entities: [
      WalletEntity,
      WagerTransactionEntity,
      WalletLedgerEntryEntity,
      InboxMessageEntity,
      OutboxMessageEntity,
    ],
    debug: false,
  });
  return orm;
}

export async function closeTestOrm() {
  if (orm) {
    await orm.close();
    orm = null;
  }
}

/**
 * Apply all SQL migrations in order using raw SQL via EntityManager.
 */
export async function applyMigrations(orm: MikroORM): Promise<void> {
  const migrationsDir = join(__dirname, '../../src/infrastructure/persistence/migrations');
  const migrationFiles = [
    '001_create_wallets.sql',
    '004_create_inbox_outbox.sql',
    '004_add_pending_reference_fields.sql',
  ];

  const em = orm.em.fork();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    // Split by semicolons to execute statements individually
    const statements = sql
      .split(';')
      .map(s => {
        // Strip SQL comments (lines starting with --)
        return s.split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      })
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await em.execute(stmt);
      } catch (err: any) {
        // Ignore errors for tables that already exist (idempotent)
        if (err.code !== '42P07') {
          throw err;
        }
      }
    }
  }
}

/**
 * Truncate all tables in the correct order (respecting FK constraints).
 */
export async function truncateAll(em: EntityManager): Promise<void> {
  await em.transactional(async (transactionEm) => {
    await transactionEm.execute('TRUNCATE wallet_ledger_entries RESTART IDENTITY CASCADE');
    await transactionEm.execute('TRUNCATE wager_transactions RESTART IDENTITY CASCADE');
    await transactionEm.execute('TRUNCATE wallets RESTART IDENTITY CASCADE');
    await transactionEm.execute('TRUNCATE inbox_messages RESTART IDENTITY CASCADE');
    await transactionEm.execute('TRUNCATE outbox_messages RESTART IDENTITY CASCADE');
  });
}

/**
 * Assert the balance invariant: wallet.balance == sum of ledger entries.
 */
export async function assertBalanceInvariant(em: EntityManager, walletId: string): Promise<void> {
  const result = await em.execute(`
    SELECT
      w.balance_amount AS stored_balance,
      COALESCE(SUM(
        CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END
      ), 0) AS calculated_balance
    FROM wallets w
    LEFT JOIN wallet_ledger_entries l ON l.wallet_id = w.id
    WHERE w.id = $1
    GROUP BY w.id, w.balance_amount
  `, [walletId]);

  if (result.length === 0) {
    throw new Error(`Wallet ${walletId} not found`);
  }

  const stored = result[0].stored_balance.toString();
  const calculated = result[0].calculated_balance.toString();

  if (stored !== calculated) {
    throw new Error(
      `Balance invariant violated for wallet ${walletId}: ` +
      `stored=${stored}, calculated=${calculated}`,
    );
  }
}

/**
 * Assert the global balance invariant: all wallets match their ledger.
 */
export async function assertGlobalBalanceInvariant(em: EntityManager): Promise<void> {
  const result = await em.execute(`
    SELECT
      w.id,
      w.balance_amount AS stored_balance,
      COALESCE(SUM(
        CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END
      ), 0) AS calculated_balance
    FROM wallets w
    LEFT JOIN wallet_ledger_entries l ON l.wallet_id = w.id
    GROUP BY w.id, w.balance_amount
    HAVING w.balance_amount != COALESCE(SUM(
        CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END
      ), 0)
  `);

  if (result.length > 0) {
    const violations = result.map(
      (r: any) => `wallet ${r.id}: stored=${r.stored_balance}, calculated=${r.calculated_balance}`,
    );
    throw new Error(`Global balance invariant violated: ${violations.join(', ')}`);
  }
}
