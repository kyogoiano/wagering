// test/http/e2e-full-flow.spec.ts
// End-to-end integration test that exercises the complete application flow:
// Create wallet → BET → CREDIT → REFUND → Ledger verification → Reconciliation → Provider query
//
// This test validates the entire request pipeline:
// Controller → Service → Repository → Database → Domain → Response

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { bootstrapTestApp, closeTestApp, truncateTestTables, HttpTestApp } from './setup';

describe('E2E — Full Wagering Flow', () => {
  let httpTestApp: HttpTestApp;
  let walletId: string;
  let playerId: string;
  const providerId = 'e2e-provider';

  beforeAll(async () => {
    httpTestApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await closeTestApp(httpTestApp);
  });

  describe('Complete wagering lifecycle', () => {
    it('should complete a full flow: create wallet → BET → CREDIT → verify ledger → reconcile', async () => {
      await truncateTestTables();

      // --- Step 1: Create wallet with initial balance ---
      playerId = crypto.randomUUID();
      const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId,
          initialBalance: { amount: '1000.00', currency: 'BRL' },
        })
        .expect(201);

      walletId = createRes.body.id;
      expect(createRes.body.balance.amount).toBe('1000.00');
      expect(createRes.body.balance.currency).toBe('BRL');

      // --- Step 2: Place a BET (debits wallet) ---
      const betRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:e2e-bet-001`)
        .send({
          providerId,
          externalTransactionId: 'e2e-bet-001',
          playerId,
          walletId,
          roundId: 'round-001',
          gameId: 'game-001',
          kind: 'BET',
          money: { amount: '150.00', currency: 'BRL' },
        })
        .expect(201);

      expect(betRes.body.status).toBe('PROCESSED');
      expect(betRes.body.balance.amount).toBe('850.00'); // 1000 - 150
      expect(betRes.body.idempotentReplay).toBe(false);
      const betTransactionId = betRes.body.transactionId;

      // --- Step 3: Place a second BET ---
      const bet2Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:e2e-bet-002`)
        .send({
          providerId,
          externalTransactionId: 'e2e-bet-002',
          playerId,
          walletId,
          roundId: 'round-002',
          gameId: 'game-001',
          kind: 'BET',
          money: { amount: '200.00', currency: 'BRL' },
        })
        .expect(201);

      expect(bet2Res.body.balance.amount).toBe('650.00'); // 850 - 200

      // --- Step 4: Process a CREDIT (win) ---
      const creditRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:e2e-credit-001`)
        .send({
          providerId,
          externalTransactionId: 'e2e-credit-001',
          playerId,
          walletId,
          roundId: 'round-001',
          gameId: 'game-001',
          kind: 'CREDIT',
          money: { amount: '500.00', currency: 'BRL' },
        })
        .expect(201);

      expect(creditRes.body.status).toBe('PROCESSED');
      expect(creditRes.body.balance.amount).toBe('1150.00'); // 650 + 500

      // --- Step 5: Verify wallet balance via GET ---
      const walletRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wallets/${walletId}`)
        .expect(200);

      expect(walletRes.body.balance.amount).toBe('1150.00');
      expect(walletRes.body.playerId).toBe(playerId);

      // --- Step 6: Verify ledger entries ---
      const ledgerRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wallets/${walletId}/ledger`)
        .expect(200);

      expect(Array.isArray(ledgerRes.body.entries)).toBe(true);
      // Opening (1000) + BET (150) + BET (200) + CREDIT (500) = 4 entries
      expect(ledgerRes.body.entries.length).toBe(4);

      // Verify ledger directions
      const directions = ledgerRes.body.entries.map((e: any) => e.direction);
      expect(directions).toContain('CREDIT'); // Opening
      expect(directions).toContain('DEBIT');  // BET
      expect(directions.filter((d: string) => d === 'DEBIT').length).toBe(2); // 2 BETs
      expect(directions.filter((d: string) => d === 'CREDIT').length).toBe(2); // Opening + CREDIT

      // --- Step 7: Reconcile wallet ---
      const reconcileRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post(`/wallets/${walletId}/reconciliation`)
        .expect(201);

      expect(reconcileRes.body.walletId).toBe(walletId);
      expect(reconcileRes.body.consistent).toBe(true);
      expect(reconcileRes.body.storedBalance.amount).toBe('1150.00');
      expect(reconcileRes.body.calculatedBalance.amount).toBe('1150.00');
      expect(reconcileRes.body.difference.amount).toMatch(/^0+\.?0*$/);
      expect(reconcileRes.body.checkedEntries).toBe(4);

      // --- Step 8: Query transaction by ID ---
      const txRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wagering/transactions/${betTransactionId}`)
        .expect(200);

      expect(txRes.body.id).toBe(betTransactionId);
      expect(txRes.body.kind).toBe('BET');
      expect(txRes.body.status).toBe('PROCESSED');
      expect(txRes.body.money.amount).toBe('150.00');

      // --- Step 9: Query transaction by provider ---
      const providerTxRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wagering/providers/${providerId}/wagering/transactions/e2e-bet-001`)
        .expect(200);

      expect(providerTxRes.body.id).toBe(betTransactionId);
      expect(providerTxRes.body.providerId).toBe(providerId);
      expect(providerTxRes.body.externalTransactionId).toBe('e2e-bet-001');
    });

    it('should process REFUND with reference to original BET', async () => {
      await truncateTestTables();

      playerId = crypto.randomUUID();
      const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId,
          initialBalance: { amount: '500.00', currency: 'BRL' },
        })
        .expect(201);

      walletId = createRes.body.id;

      // Place a BET
      const betRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:refund-bet-001`)
        .send({
          providerId,
          externalTransactionId: 'refund-bet-001',
          playerId,
          walletId,
          roundId: 'round-refund-001',
          gameId: 'game-refund-001',
          kind: 'BET',
          money: { amount: '100.00', currency: 'BRL' },
        })
        .expect(201);

      expect(betRes.body.balance.amount).toBe('400.00'); // 500 - 100

      // REFUND the BET with reference
      const refundRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:refund-001`)
        .send({
          providerId,
          externalTransactionId: 'refund-001',
          playerId,
          walletId,
          roundId: 'round-refund-001',
          gameId: 'game-refund-001',
          kind: 'REFUND',
          money: { amount: '100.00', currency: 'BRL' },
          referenceExternalTransactionId: 'refund-bet-001',
        })
        .expect(201);

      expect(refundRes.body.status).toBe('PROCESSED');
      expect(refundRes.body.balance.amount).toBe('500.00'); // 400 + 100 (refund credits back)

      // Verify ledger: Opening CREDIT + BET DEBIT + REFUND CREDIT = 3 entries
      const ledgerRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wallets/${walletId}/ledger`)
        .expect(200);

      expect(ledgerRes.body.entries.length).toBe(3);

      // Reconcile — should be consistent
      const reconcileRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post(`/wallets/${walletId}/reconciliation`)
        .expect(201);

      expect(reconcileRes.body.consistent).toBe(true);
      expect(reconcileRes.body.storedBalance.amount).toBe('500.00');
      expect(reconcileRes.body.calculatedBalance.amount).toBe('500.00');
    });

    it('should handle idempotent replay across the full flow', async () => {
      await truncateTestTables();

      playerId = crypto.randomUUID();
      const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId,
          initialBalance: { amount: '100.00', currency: 'BRL' },
        })
        .expect(201);

      walletId = createRes.body.id;

      // First BET
      const firstBet = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:idempotent-flow-001`)
        .send({
          providerId,
          externalTransactionId: 'idempotent-flow-001',
          playerId,
          walletId,
          roundId: 'round-idempotent-001',
          gameId: 'game-idempotent-001',
          kind: 'BET',
          money: { amount: '30.00', currency: 'BRL' },
        })
        .expect(201);

      expect(firstBet.body.idempotentReplay).toBe(false);

      // Replay the same BET with the same idempotency key
      const replayBet = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:idempotent-flow-001`)
        .send({
          providerId,
          externalTransactionId: 'idempotent-flow-001',
          playerId,
          walletId,
          roundId: 'round-idempotent-001',
          gameId: 'game-idempotent-001',
          kind: 'BET',
          money: { amount: '30.00', currency: 'BRL' },
        })
        .expect(201);

      expect(replayBet.body.idempotentReplay).toBe(true);
      expect(replayBet.body.transactionId).toBe(firstBet.body.transactionId);

      // Verify only one ledger entry for the BET (not duplicated)
      const ledgerRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wallets/${walletId}/ledger`)
        .expect(200);

      // Opening + 1 BET = 2 entries (not 3)
      expect(ledgerRes.body.entries.length).toBe(2);
    });

    it('should handle independent wallets for different players', async () => {
      await truncateTestTables();

      const player1Id = crypto.randomUUID();
      const player2Id = crypto.randomUUID();

      // Create two wallets for different players
      const wallet1Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId: player1Id,
          initialBalance: { amount: '100.00', currency: 'BRL' },
        })
        .expect(201);

      const wallet2Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId: player2Id,
          initialBalance: { amount: '200.00', currency: 'BRL' },
        })
        .expect(201);

      const wallet1Id = wallet1Res.body.id;
      const wallet2Id = wallet2Res.body.id;
      expect(wallet1Id).not.toBe(wallet2Id);

      // BET on wallet 1
      await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:independent-wallet-1`)
        .send({
          providerId,
          externalTransactionId: 'independent-wallet-1',
          playerId: player1Id,
          walletId: wallet1Id,
          roundId: 'round-independent-1',
          gameId: 'game-independent-1',
          kind: 'BET',
          money: { amount: '50.00', currency: 'BRL' },
        })
        .expect(201);

      // BET on wallet 2
      await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:independent-wallet-2`)
        .send({
          providerId,
          externalTransactionId: 'independent-wallet-2',
          playerId: player2Id,
          walletId: wallet2Id,
          roundId: 'round-independent-2',
          gameId: 'game-independent-2',
          kind: 'BET',
          money: { amount: '80.00', currency: 'BRL' },
        })
        .expect(201);

      // Verify wallet 1: 100 - 50 = 50
      const w1Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wallets/${wallet1Id}`)
        .expect(200);
      expect(w1Res.body.balance.amount).toBe('50.00');

      // Verify wallet 2: 200 - 80 = 120
      const w2Res = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .get(`/wallets/${wallet2Id}`)
        .expect(200);
      expect(w2Res.body.balance.amount).toBe('120.00');

      // Both wallets reconcile correctly
      const reconcile1 = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post(`/wallets/${wallet1Id}/reconciliation`)
        .expect(201);
      expect(reconcile1.body.consistent).toBe(true);

      const reconcile2 = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post(`/wallets/${wallet2Id}/reconciliation`)
        .expect(201);
      expect(reconcile2.body.consistent).toBe(true);
    });

    it('should handle a complete game session: BET → WIN → SETTLE flow', async () => {
      await truncateTestTables();

      playerId = crypto.randomUUID();
      const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId,
          initialBalance: { amount: '1000.00', currency: 'BRL' },
        })
        .expect(201);

      walletId = createRes.body.id;

      // BET: Player places a bet
      const betRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:game-bet-001`)
        .send({
          providerId,
          externalTransactionId: 'game-bet-001',
          playerId,
          walletId,
          roundId: 'round-game-001',
          gameId: 'game-session-001',
          kind: 'BET',
          money: { amount: '100.00', currency: 'BRL' },
        })
        .expect(201);

      expect(betRes.body.balance.amount).toBe('900.00');

      // WIN: Player wins 250
      const winRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:game-win-001`)
        .send({
          providerId,
          externalTransactionId: 'game-win-001',
          playerId,
          walletId,
          roundId: 'round-game-001',
          gameId: 'game-session-001',
          kind: 'CREDIT',
          money: { amount: '250.00', currency: 'BRL' },
        })
        .expect(201);

      expect(winRes.body.balance.amount).toBe('1150.00'); // 900 + 250

      // Final reconciliation
      const reconcileRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post(`/wallets/${walletId}/reconciliation`)
        .expect(201);

      expect(reconcileRes.body.consistent).toBe(true);
      expect(reconcileRes.body.storedBalance.amount).toBe('1150.00');
      expect(reconcileRes.body.calculatedBalance.amount).toBe('1150.00');
      expect(reconcileRes.body.checkedEntries).toBe(3); // Opening + BET + WIN
    });

    it('should handle a loss scenario: BET → LOSS (no balance change)', async () => {
      await truncateTestTables();

      playerId = crypto.randomUUID();
      const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wallets')
        .send({
          playerId,
          initialBalance: { amount: '500.00', currency: 'BRL' },
        })
        .expect(201);

      walletId = createRes.body.id;

      // BET: Player places a bet
      const betRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:loss-bet-001`)
        .send({
          providerId,
          externalTransactionId: 'loss-bet-001',
          playerId,
          walletId,
          roundId: 'round-loss-001',
          gameId: 'game-loss-001',
          kind: 'BET',
          money: { amount: '100.00', currency: 'BRL' },
        })
        .expect(201);

      expect(betRes.body.balance.amount).toBe('400.00'); // 500 - 100

      // LOSS: Player loses — LOSS does not affect balance (bet already debited)
      const lossRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post('/wagering/transactions')
        .set('Idempotency-Key', `${providerId}:loss-001`)
        .send({
          providerId,
          externalTransactionId: 'loss-001',
          playerId,
          walletId,
          roundId: 'round-loss-001',
          gameId: 'game-loss-001',
          kind: 'LOSS',
          money: { amount: '100.00', currency: 'BRL' },
        })
        .expect(201);

      // LOSS should not change balance — remains 400
      expect(lossRes.body.balance.amount).toBe('400.00');

      // Reconcile
      const reconcileRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
        .post(`/wallets/${walletId}/reconciliation`)
        .expect(201);

      expect(reconcileRes.body.consistent).toBe(true);
      expect(reconcileRes.body.storedBalance.amount).toBe('400.00');
    });
  });
});
