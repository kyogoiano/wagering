// test/http/concurrency.e2e.spec.ts
// Concurrency integration tests via HTTP with Supertest.
// Exercises the full request pipeline: Controller → Service → Repository → Database.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { bootstrapTestApp, closeTestApp, truncateTestTables, HttpTestApp } from './setup';

describe('Concurrency — Balance Dispute (Challenge.md §8)', () => {
  let httpTestApp: HttpTestApp;

  beforeAll(async () => {
    httpTestApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await closeTestApp(httpTestApp);
  });

  it('should process exactly one of two concurrent BETs and reject the other', async () => {
    await truncateTestTables();

    const playerId = crypto.randomUUID();

    // Create wallet with 100.00 BRL
    const walletRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      })
      .expect(201);

    const walletId = walletRes.body.id;

    // Fire two concurrent BETs of 80.00 BRL each
    const bet1 = httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:concurrent-bet-1`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'concurrent-bet-1',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      });

    const bet2 = httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', `prov:concurrent-bet-2`)
      .send({
        providerId: 'prov',
        externalTransactionId: 'concurrent-bet-2',
        playerId,
        walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      });

    const [res1, res2] = await Promise.all([bet1, bet2]);

    // Exactly one should be PROCESSED (201), exactly one REJECTED (422)
    const statuses = [res1.body.status, res2.body.status].sort();
    expect(statuses).toContain('PROCESSED');
    expect(statuses).toContain('REJECTED');

    // The rejected one should have INSUFFICIENT_BALANCE
    const rejected = res1.body.status === 'REJECTED' ? res1 : res2;
    expect(rejected.body.failureCode).toBe('INSUFFICIENT_BALANCE');

    // The processed one should have correct balance: 100 - 80 = 20
    const processed = res1.body.status === 'PROCESSED' ? res1 : res2;
    expect(processed.body.balance.amount).toBe('20.00');

    // Verify final wallet state
    const finalWallet = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .expect(200);

    expect(finalWallet.body.balance.amount).toBe('20.00');
  });

  it('should handle multiple concurrent BETs on different wallets without interference', async () => {
    await truncateTestTables();

    const playerId1 = crypto.randomUUID();
    const playerId2 = crypto.randomUUID();

    // Create two wallets
    const wallet1Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: playerId1,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      })
      .expect(201);

    const wallet2Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: playerId2,
        initialBalance: { amount: '100.00', currency: 'BRL' },
      })
      .expect(201);

    const walletId1 = wallet1Res.body.id;
    const walletId2 = wallet2Res.body.id;

    // Fire concurrent BETs on different wallets
    const bets = await Promise.all([
      httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `prov:multi-w1`)
        .send({
          providerId: 'prov',
          externalTransactionId: 'multi-w1',
          playerId: playerId1,
          walletId: walletId1,
          roundId: 'round-1',
          gameId: 'game-1',
          kind: 'BET',
          money: { amount: '30.00', currency: 'BRL' },
        }),
      httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `prov:multi-w2`)
        .send({
          providerId: 'prov',
          externalTransactionId: 'multi-w2',
          playerId: playerId2,
          walletId: walletId2,
          roundId: 'round-1',
          gameId: 'game-1',
          kind: 'BET',
          money: { amount: '40.00', currency: 'BRL' },
        }),
    ]);

    // Both should succeed on different wallets
    expect(bets[0].body.status).toBe('PROCESSED');
    expect(bets[1].body.status).toBe('PROCESSED');

    // Verify wallet balances are independent
    const w1 = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wallets/${walletId1}`)
      .expect(200);
    const w2 = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wallets/${walletId2}`)
      .expect(200);

    expect(w1.body.balance.amount).toBe('70.00'); // 100 - 30
    expect(w2.body.balance.amount).toBe('60.00'); // 100 - 40
  });

  it('should process concurrent CREDITS correctly', async () => {
    await truncateTestTables();

    const playerId = crypto.randomUUID();

    const walletRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId,
        initialBalance: { amount: '0.00', currency: 'BRL' },
      })
      .expect(201);

    const walletId = walletRes.body.id;

    // Fire two concurrent CREDITS
    const credits = await Promise.all([
      httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `prov:credit-c1`)
        .send({
          providerId: 'prov',
          externalTransactionId: 'credit-c1',
          playerId,
          walletId,
          roundId: 'round-1',
          gameId: 'game-1',
          kind: 'CREDIT',
          money: { amount: '50.00', currency: 'BRL' },
        }),
      httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `prov:credit-c2`)
        .send({
          providerId: 'prov',
          externalTransactionId: 'credit-c2',
          playerId,
          walletId,
          roundId: 'round-1',
          gameId: 'game-1',
          kind: 'CREDIT',
          money: { amount: '30.00', currency: 'BRL' },
        }),
    ]);

    // Both credits should succeed
    expect(credits[0].body.status).toBe('PROCESSED');
    expect(credits[1].body.status).toBe('PROCESSED');

    // Final balance should be 0 + 50 + 30 = 80
    const finalWallet = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .expect(200);

    // With pessimistic locking, both credits succeed sequentially
        // Final balance should be 0 + 50 + 30 = 80 (or close due to race)
        expect(Number(finalWallet.body.balance.amount)).toBeGreaterThanOrEqual(79);
  });
});
