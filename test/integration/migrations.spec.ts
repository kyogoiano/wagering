// test/integration/migrations.spec.ts
// Verify that SQL migrations and constraints are applied correctly.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  initTestOrm,
  closeTestOrm,
  applyMigrations,
  assertGlobalBalanceInvariant,
} from './setup';

describe('Migrations', () => {
  beforeAll(async () => {
    const orm = await initTestOrm();
    await applyMigrations(orm);
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  it('should create all required tables', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();

    const tables = await em.execute(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableNames = tables.map((t: any) => t.table_name);
    expect(tableNames).toContain('wallets');
    expect(tableNames).toContain('wager_transactions');
    expect(tableNames).toContain('wallet_ledger_entries');
    expect(tableNames).toContain('inbox_messages');
    expect(tableNames).toContain('outbox_messages');
  });

  it('should enforce wallet balance >= 0 constraint', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();

    // Create a wallet first
    const playerId = crypto.randomUUID();
    await em.execute(
      `INSERT INTO wallets (player_id, currency, balance_amount) VALUES ('${playerId}', 'BRL', 0)`,
    );

    // Try to insert negative balance
    await expect(
      em.execute(`UPDATE wallets SET balance_amount = -1 WHERE player_id = '${playerId}'`),
    ).rejects.toThrow();

    // Clean up
    await em.execute(`DELETE FROM wallets WHERE player_id = '${playerId}'`);
  });

  it('should enforce unique wallet (player_id, currency)', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();

    const playerId = crypto.randomUUID();
    await em.execute(
      `INSERT INTO wallets (player_id, currency, balance_amount) VALUES ('${playerId}', 'BRL', 100.00)`,
    );

    await expect(
      em.execute(
        `INSERT INTO wallets (player_id, currency, balance_amount) VALUES ('${playerId}', 'BRL', 50.00)`,
      ),
    ).rejects.toThrow();

    await em.execute(`DELETE FROM wallets WHERE player_id = '${playerId}'`);
  });

  it('should enforce unique idempotency_key', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();

    // Clean up any stale data from previous runs
    await em.transactional(async (txEm: any) => {
      await txEm.execute('TRUNCATE wallet_ledger_entries RESTART IDENTITY CASCADE');
      await txEm.execute('TRUNCATE wager_transactions RESTART IDENTITY CASCADE');
      await txEm.execute('TRUNCATE wallets RESTART IDENTITY CASCADE');
    });

    const playerId = crypto.randomUUID();
    await em.execute(
      `INSERT INTO wallets (player_id, currency, balance_amount) VALUES ('${playerId}', 'BRL', 100.00)`,
    );

    const walletRow = await em.execute(`SELECT id FROM wallets WHERE player_id = '${playerId}'`);
    const walletId = walletRow[0].id;

    await em.execute(
      `INSERT INTO wager_transactions (
        provider_id, external_transaction_id, idempotency_key, payload_hash,
        wallet_id, player_id, round_id, game_id, kind, money_amount, money_currency, status
      ) VALUES ('prov', 'tx-1', 'key-1', 'hash1', '${walletId}', '${playerId}', 'r1', 'g1', 'BET', 10.00, 'BRL', 'PENDING')`,
    );

    await expect(
      em.execute(
        `INSERT INTO wager_transactions (
          provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind, money_amount, money_currency, status
        ) VALUES ('prov', 'tx-2', 'key-1', 'hash2', '${walletId}', '${playerId}', 'r1', 'g1', 'BET', 20.00, 'BRL', 'PENDING')`,
      ),
    ).rejects.toThrow();

    await em.execute(`DELETE FROM wager_transactions WHERE wallet_id = '${walletId}'`);
    await em.execute(`DELETE FROM wallets WHERE player_id = '${playerId}'`);
  });

  it('should enforce ledger direction constraint', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();

    await expect(
      em.execute(
        `INSERT INTO wallet_ledger_entries (
          wallet_id, transaction_id, direction, amount, currency, balance_before, balance_after
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), crypto.randomUUID(), 'INVALID', '10.00', 'BRL', '0', '10.00'],
      ),
    ).rejects.toThrow();
  });

  it('should have pending_reference fields on wager_transactions', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();

    const columns = await em.execute(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'wager_transactions' AND column_name IN ('attempts', 'next_attempt_at')
      ORDER BY column_name
    `);

    expect(columns.length).toBe(2);
    const colNames = columns.map((c: any) => c.column_name);
    expect(colNames).toContain('attempts');
    expect(colNames).toContain('next_attempt_at');
  });

  it('should pass global balance invariant after clean state', async () => {
    const orm = await initTestOrm();
    const em = orm.em.fork();
    // Truncate all tables to ensure clean state
    await em.transactional(async (txEm: any) => {
      await txEm.execute('TRUNCATE wallet_ledger_entries RESTART IDENTITY CASCADE');
      await txEm.execute('TRUNCATE wager_transactions RESTART IDENTITY CASCADE');
      await txEm.execute('TRUNCATE wallets RESTART IDENTITY CASCADE');
      await txEm.execute('TRUNCATE inbox_messages RESTART IDENTITY CASCADE');
      await txEm.execute('TRUNCATE outbox_messages RESTART IDENTITY CASCADE');
    });
    await assertGlobalBalanceInvariant(em);
  });
});
