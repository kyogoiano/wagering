// test/http/wagering.e2e.spec.ts
// Integration tests for wagering transaction endpoints via HTTP.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { bootstrapTestApp, closeTestApp, truncateTestTables, HttpTestApp } from './setup';

describe('Wagering Endpoints', () => {
  let httpTestApp: HttpTestApp;
  let walletId: string;
  let playerId: string;

  beforeAll(async () => {
    httpTestApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await closeTestApp(httpTestApp);
  });

  async function createTestWallet(balance: string = '100.00'): Promise<string> {
    await truncateTestTables();
    playerId = crypto.randomUUID();
    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId,
        initialBalance: { amount: balance, currency: 'BRL' },
      })
      .expect(201);
    walletId = res.body.id;
    return walletId;
  }

  it('POST /wagering/transactions processes a BET successfully', async () => {
    await createTestWallet();

    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:bet-http-1`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'bet-http-1',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      })
      .expect(201);

    expect(res.body.transactionId).toBeDefined();
    expect(res.body.status).toBe('PROCESSED');
    expect(res.body.balance.amount).toBe('75.00');
    expect(res.body.idempotentReplay).toBe(false);
  });

  it('POST /wagering/transactions returns idempotent replay for duplicate request', async () => {
    await createTestWallet();

    const firstRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:idempotent-test`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'idempotent-test',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      })
      .expect(201);

    expect(firstRes.body.idempotentReplay).toBe(false);
    expect(firstRes.body.balance.amount).toBe('90.00');

    // Same idempotency key, same payload → idempotent replay
    const secondRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:idempotent-test`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'idempotent-test',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      })
      .expect(201);

    expect(secondRes.body.idempotentReplay).toBe(true);
    expect(secondRes.body.transactionId).toBe(firstRes.body.transactionId);
    expect(secondRes.body.balance.amount).toBe('90.00'); // balance unchanged
  });

  it('POST /wagering/transactions rejects BET with insufficient balance', async () => {
    await createTestWallet('50.00');

    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:insufficient-1`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'insufficient-1',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      })
      .expect(422);

    expect(res.body.status).toBe('REJECTED');
    expect(res.body.failureCode).toBe('INSUFFICIENT_BALANCE');
  });

  it('POST /wagering/transactions processes a CREDIT successfully', async () => {
    await createTestWallet();

    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:credit-http-1`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'credit-http-1',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'CREDIT',
        money: { amount: '30.00', currency: 'BRL' },
      })
      .expect(201);

    expect(res.body.status).toBe('PROCESSED');
    expect(res.body.balance.amount).toBe('130.00');
  });

  it('GET /wagering/transactions/:transactionId returns transaction details', async () => {
    await createTestWallet();

    const submitRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:get-by-id-1`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'get-by-id-1',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '15.00', currency: 'BRL' },
      })
      .expect(201);

    const transactionId = submitRes.body.transactionId;

    const getRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wagering/transactions/${transactionId}`)
      .expect(200);

    expect(getRes.body.id).toBe(transactionId);
    expect(getRes.body.status).toBe('PROCESSED');
    expect(getRes.body.kind).toBe('BET');
    expect(getRes.body.money.amount).toBe('15.00');
  });

  it('POST /wagering/transactions rejects missing idempotency key', async () => {
    await createTestWallet();

    await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .send({
        providerId: 'prov',
        externalTransactionId: 'no-key-1',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      })
      .expect(400);
  });
});
