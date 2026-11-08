import { describe, expect, it, mock, beforeAll } from 'bun:test';
import { WagerTransactionStatus } from '@domain/transaction';
import { FailureCode } from '@domain/failure';

// Import worker lazily to avoid pulling in MikroORM entities in test environment
let PendingReferenceWorker: any;
beforeAll(async () => {
  const mod = await import('./pending-reference.worker');
  PendingReferenceWorker = mod.PendingReferenceWorker;
});

describe('PendingReferenceWorker', () => {
  describe('calculateBackoff', () => {
    it('should use baseDelay * 2^attempt formula', () => {
      const worker = new PendingReferenceWorker({}, {}, {}, {});
      expect(worker.calculateBackoff(0)).toBe(5_000);
      expect(worker.calculateBackoff(1)).toBe(10_000);
      expect(worker.calculateBackoff(2)).toBe(20_000);
      expect(worker.calculateBackoff(3)).toBe(40_000);
    });

    it('should cap at maxDelay', () => {
      const worker = new PendingReferenceWorker({}, {}, {}, {}, {
        baseDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxAttempts: 10,
        ttlMs: 300_000,
      });
      expect(worker.calculateBackoff(9)).toBe(300_000);
      expect(worker.calculateBackoff(10)).toBe(300_000);
    });

    it('should respect custom config', () => {
      const worker = new PendingReferenceWorker({}, {}, {}, {}, {
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        maxAttempts: 5,
        ttlMs: 60_000,
      });
      expect(worker.calculateBackoff(0)).toBe(1_000);
      expect(worker.calculateBackoff(1)).toBe(2_000);
      expect(worker.calculateBackoff(3)).toBe(8_000);
      expect(worker.calculateBackoff(4)).toBe(10_000);
    });
  });

  describe('rejectTransaction', () => {
    it('should set status to REJECTED with failure code', async () => {
      const updateMock = mock(async () => {});
      const repo = { update: updateMock };
      const worker = new PendingReferenceWorker({}, repo, {}, {});

      const tx = {
        id: 'tx-1',
        status: WagerTransactionStatus.PendingReference,
        failureCode: undefined,
        processedAt: undefined,
      };

      await worker.rejectTransaction(tx, FailureCode.REFERENCE_NOT_FOUND);

      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.REFERENCE_NOT_FOUND);
      expect(tx.processedAt).toBeInstanceOf(Date);
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('processOne - TTL exceeded', () => {
    it('should reject when TTL is exceeded', async () => {
      const updateMock = mock(async () => {});
      const repo = {
        update: updateMock,
        findByProviderAndExternalId: mock(async () => null),
      };
      const worker = new PendingReferenceWorker({}, repo, {}, {}, {
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        maxAttempts: 10,
        ttlMs: 1_000,
      });

      const tx = {
        id: 'tx-1',
        status: WagerTransactionStatus.PendingReference,
        attempts: 0,
        createdAt: new Date(Date.now() - 2_000),
        providerId: 'provider-a',
        referenceExternalTransactionId: 'ref-1',
      };

      await worker.processOne(tx);

      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.REFERENCE_NOT_FOUND);
    });
  });

  describe('processOne - max attempts exceeded', () => {
    it('should reject when max attempts exceeded', async () => {
      const updateMock = mock(async () => {});
      const repo = {
        update: updateMock,
        findByProviderAndExternalId: mock(async () => null),
      };
      const worker = new PendingReferenceWorker({}, repo, {}, {}, {
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        maxAttempts: 3,
        ttlMs: 60_000,
      });

      const tx = {
        id: 'tx-1',
        status: WagerTransactionStatus.PendingReference,
        attempts: 3,
        createdAt: new Date(),
        providerId: 'provider-a',
        referenceExternalTransactionId: 'ref-1',
      };

      await worker.processOne(tx);

      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.REFERENCE_NOT_FOUND);
    });
  });

  describe('processOne - reference not found', () => {
    it('should schedule retry with backoff when reference not found', async () => {
      const updateMock = mock(async () => {});
      const repo = {
        update: updateMock,
        findByProviderAndExternalId: mock(async () => null),
      };
      const worker = new PendingReferenceWorker({}, repo, {}, {}, {
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        maxAttempts: 10,
        ttlMs: 60_000,
      });

      const tx = {
        id: 'tx-1',
        status: WagerTransactionStatus.PendingReference,
        attempts: 0,
        createdAt: new Date(),
        providerId: 'provider-a',
        referenceExternalTransactionId: 'ref-1',
        nextAttemptAt: undefined,
      };

      await worker.processOne(tx);

      expect(tx.attempts).toBe(1);
      expect(tx.nextAttemptAt).toBeInstanceOf(Date);
      const delay = tx.nextAttemptAt.getTime() - Date.now();
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(1100);
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('processOne - reference found but not processed', () => {
    it('should schedule retry when reference exists but is not PROCESSED', async () => {
      const updateMock = mock(async () => {});
      const repo = {
        update: updateMock,
        findByProviderAndExternalId: mock(async () => ({
          id: 'ref-tx-1',
          status: WagerTransactionStatus.Pending,
        })),
      };
      const worker = new PendingReferenceWorker({}, repo, {}, {}, {
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        maxAttempts: 10,
        ttlMs: 60_000,
      });

      const tx = {
        id: 'tx-1',
        status: WagerTransactionStatus.PendingReference,
        attempts: 0,
        createdAt: new Date(),
        providerId: 'provider-a',
        referenceExternalTransactionId: 'ref-1',
        nextAttemptAt: undefined,
      };

      await worker.processOne(tx);

      expect(tx.attempts).toBe(1);
      expect(tx.nextAttemptAt).toBeInstanceOf(Date);
    });
  });
});
