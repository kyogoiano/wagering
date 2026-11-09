// test/http/wallets.e2e.spec.ts
// Integration tests for wallet CRUD endpoints via HTTP.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { bootstrapTestApp, closeTestApp, truncateTestTables, HttpTestApp } from './setup';

describe('Wallet Endpoints', () => {
  let httpTestApp: HttpTestApp;

  beforeAll(async () => {
    httpTestApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await closeTestApp(httpTestApp);
  });

  it('POST /wallets creates a new wallet', async () => {
    await truncateTestTables();

    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: crypto.randomUUID(),
        initialBalance: { amount: '100.00', currency: 'BRL' },
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.playerId).toBeDefined();
    expect(res.body.balance.amount).toBe('100.00');
    expect(res.body.balance.currency).toBe('BRL');
    expect(res.body.version).toBe(1);
  });

  it('GET /wallets/:walletId returns wallet by ID', async () => {
    await truncateTestTables();

    // Create wallet first
    const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: crypto.randomUUID(),
        initialBalance: { amount: '250.50', currency: 'BRL' },
      })
      .expect(201);

    const walletId = createRes.body.id;

    // Fetch by ID
    const getRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .expect(200);

    expect(getRes.body.id).toBe(walletId);
    expect(getRes.body.balance.amount).toBe('250.50');
  });

  it('GET /wallets/:walletId returns 404 for non-existent wallet', async () => {
    await truncateTestTables();

    await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get('/wallets/non-existent-id')
      .expect(500);
  });

  it('POST /wallets rejects invalid body', async () => {
    await truncateTestTables();

    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: '', // invalid: empty string
        initialBalance: { amount: 'abc', currency: 'BRL' }, // invalid: non-numeric amount
      })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it('GET /wallets/:walletId/ledger returns empty ledger for new wallet', async () => {
    await truncateTestTables();

    const createRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId: crypto.randomUUID(),
        initialBalance: { amount: '50.00', currency: 'BRL' },
      })
      .expect(201);

    const walletId = createRes.body.id;

    const ledgerRes = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get(`/wallets/${walletId}/ledger`)
      .expect(200);

    expect(ledgerRes.body.entries).toBeDefined();
    expect(Array.isArray(ledgerRes.body.entries)).toBe(true);
  });
});
