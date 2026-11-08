import { describe, expect, it, mock } from 'bun:test';
import { IdempotencyService } from './idempotency.service';
import { WagerTransactionRepository } from '@infrastructure/persistence/wager-transaction.repository';
import { Money } from '@domain/money';
import { WagerTransactionKind, WagerTransactionStatus } from '@domain/transaction';

describe('IdempotencyService', () => {
  const buildMockRepo = (
    byIdempotency: any | null = null,
    byProvider: any | null = null,
  ) => {
    const repo = {} as any as WagerTransactionRepository;
    repo.findByIdempotencyKey = mock(() => Promise.resolve(byIdempotency));
    repo.findByProviderAndExternalId = mock(() => Promise.resolve(byProvider));
    return repo;
  };

  const baseInput = {
    idempotencyKey: 'provider-a:tx-123',
    providerId: 'provider-a',
    externalTransactionId: 'tx-123',
    playerId: 'player-1',
    walletId: 'wallet-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet as WagerTransactionKind,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
  };

  const existingTransaction = {
    id: 'tx-uuid-1',
    providerId: 'provider-a',
    externalTransactionId: 'tx-123',
    idempotencyKey: 'provider-a:tx-123',
    payloadHash: 'abc123',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: 'BET',
    moneyAmount: '25.00',
    moneyCurrency: 'BRL',
    status: WagerTransactionStatus.Processed,
    referenceExternalTransactionId: undefined,
    referenceTransactionId: undefined,
    failureCode: undefined,
    processedAt: new Date(),
    createdAt: new Date(),
  };

  describe('check', () => {
    it('should return isDuplicate=false when no existing transaction', async () => {
      const repo = buildMockRepo(null);
      const service = new IdempotencyService(repo);
      const result = await service.check(baseInput);
      expect(result.isDuplicate).toBe(false);
      expect(result.cachedResult).toBeUndefined();
    });

    it('should return isDuplicate=true when payload hash matches', async () => {
      // We need the hash to match — so we compute it from the input
      const { computePayloadHash } = await import('@application/wager/process-transaction.usecase');
      const hash = computePayloadHash(baseInput);
      const matchingTx = { ...existingTransaction, payloadHash: hash };
      const repo = buildMockRepo(matchingTx);
      const service = new IdempotencyService(repo);
      const result = await service.check(baseInput);
      expect(result.isDuplicate).toBe(true);
      expect(result.cachedResult).toEqual({
        transactionId: matchingTx.id,
        status: matchingTx.status,
        balanceAmount: matchingTx.moneyAmount,
        balanceCurrency: matchingTx.moneyCurrency,
      });
    });

    it('should throw IdempotencyConflictError when payload hash differs', async () => {
      const repo = buildMockRepo({ ...existingTransaction, payloadHash: 'different-hash' });
      const service = new IdempotencyService(repo);
      await expect(service.check(baseInput)).rejects.toThrow(IdempotencyConflictError);
    });

    it('should include the idempotency key in the error message', async () => {
      const repo = buildMockRepo({ ...existingTransaction, payloadHash: 'different-hash' });
      const service = new IdempotencyService(repo);
      try {
        await service.check(baseInput);
        expect('should have thrown').toBe('did not throw');
      } catch (error) {
        expect((error as Error).message).toContain('provider-a:tx-123');
      }
    });
  });

  describe('checkByProviderExternalId', () => {
    it('should return isDuplicate=false when no existing transaction', async () => {
      const repo = buildMockRepo(null, null);
      const service = new IdempotencyService(repo);
      const result = await service.checkByProviderExternalId('provider-a', 'tx-123');
      expect(result.isDuplicate).toBe(false);
    });

    it('should return isDuplicate=true when transaction exists by provider+externalId', async () => {
      const repo = buildMockRepo(null, existingTransaction);
      const service = new IdempotencyService(repo);
      const result = await service.checkByProviderExternalId('provider-a', 'tx-123');
      expect(result.isDuplicate).toBe(true);
      expect(result.cachedResult).toEqual({
        transactionId: existingTransaction.id,
        status: existingTransaction.status,
        balanceAmount: existingTransaction.moneyAmount,
        balanceCurrency: existingTransaction.moneyCurrency,
      });
    });
  });
});
