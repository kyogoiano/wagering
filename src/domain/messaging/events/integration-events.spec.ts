import { describe, expect, it } from 'bun:test';
import { WagerTransactionProcessed } from './wager-transaction-processed.event';
import { WagerTransactionRejected } from './wager-transaction-rejected.event';
import { WalletBalanceChanged } from './wallet-balance-changed.event';
import { WagerTransactionPendingReference } from './wager-transaction-pending-reference.event';

describe('Integration Events', () => {
  const now = new Date('2024-01-01T00:00:00Z');

  describe('WagerTransactionProcessed', () => {
    it('should have correct eventType and version', () => {
      const evt = new WagerTransactionProcessed(
        'evt-1',
        'tx-1',
        'corr-1',
        undefined,
        now,
        {
          transactionId: 'tx-1',
          walletId: 'w-1',
          kind: 'BET',
          status: 'PROCESSED',
          amount: '10.00',
          currency: 'BRL',
        },
      );
      expect(evt.eventType).toBe('WagerTransactionProcessed');
      expect(evt.version).toBe(1);
    });

    it('should serialize to JSON with ISO date', () => {
      const evt = new WagerTransactionProcessed(
        'evt-1',
        'tx-1',
        'corr-1',
        undefined,
        now,
        {
          transactionId: 'tx-1',
          walletId: 'w-1',
          kind: 'BET',
          status: 'PROCESSED',
          amount: '10.00',
          currency: 'BRL',
        },
      );
      const json = evt.toJSON();
      expect(json.eventType).toBe('WagerTransactionProcessed');
      expect(json.occurredAt).toBe('2024-01-01T00:00:00.000Z');
      expect(json.version).toBe(1);
      expect(json.data.amount).toBe('10.00');
      expect(json.causationId).toBeUndefined();
    });
  });

  describe('WagerTransactionRejected', () => {
    it('should have correct eventType and version', () => {
      const evt = new WagerTransactionRejected(
        'evt-2',
        'tx-2',
        'corr-2',
        undefined,
        now,
        {
          transactionId: 'tx-2',
          walletId: 'w-1',
          kind: 'BET',
          reason: 'Insufficient balance',
          failureCode: 'INSUFFICIENT_BALANCE',
        },
      );
      expect(evt.eventType).toBe('WagerTransactionRejected');
      expect(evt.version).toBe(1);
    });

    it('should serialize with rejection details', () => {
      const evt = new WagerTransactionRejected(
        'evt-2',
        'tx-2',
        'corr-2',
        undefined,
        now,
        {
          transactionId: 'tx-2',
          walletId: 'w-1',
          kind: 'BET',
          reason: 'Insufficient balance',
          failureCode: 'INSUFFICIENT_BALANCE',
        },
      );
      const json = evt.toJSON();
      expect(json.data.failureCode).toBe('INSUFFICIENT_BALANCE');
      expect(json.data.reason).toBe('Insufficient balance');
    });
  });

  describe('WalletBalanceChanged', () => {
    it('should have correct eventType and version', () => {
      const evt = new WalletBalanceChanged(
        'evt-3',
        'w-1',
        'corr-3',
        undefined,
        now,
        {
          walletId: 'w-1',
          balanceBefore: '50.00',
          balanceAfter: '40.00',
          currency: 'BRL',
          transactionId: 'tx-1',
        },
      );
      expect(evt.eventType).toBe('WalletBalanceChanged');
      expect(evt.version).toBe(1);
    });

    it('should serialize with balance details', () => {
      const evt = new WalletBalanceChanged(
        'evt-3',
        'w-1',
        'corr-3',
        undefined,
        now,
        {
          walletId: 'w-1',
          balanceBefore: '50.00',
          balanceAfter: '40.00',
          currency: 'BRL',
          transactionId: 'tx-1',
        },
      );
      const json = evt.toJSON();
      expect(json.data.balanceBefore).toBe('50.00');
      expect(json.data.balanceAfter).toBe('40.00');
      expect(json.data.currency).toBe('BRL');
    });
  });

  describe('WagerTransactionPendingReference', () => {
    it('should have correct eventType and version', () => {
      const evt = new WagerTransactionPendingReference(
        'evt-4',
        'tx-4',
        'corr-4',
        undefined,
        now,
        {
          transactionId: 'tx-4',
          walletId: 'w-1',
          kind: 'WIN',
          referenceId: 'ref-1',
        },
      );
      expect(evt.eventType).toBe('WagerTransactionPendingReference');
      expect(evt.version).toBe(1);
    });

    it('should serialize with reference details', () => {
      const evt = new WagerTransactionPendingReference(
        'evt-4',
        'tx-4',
        'corr-4',
        undefined,
        now,
        {
          transactionId: 'tx-4',
          walletId: 'w-1',
          kind: 'WIN',
          referenceId: 'ref-1',
        },
      );
      const json = evt.toJSON();
      expect(json.data.referenceId).toBe('ref-1');
    });
  });

  describe('Event envelope common properties', () => {
    it.each([
      [
        'WagerTransactionProcessed',
        new WagerTransactionProcessed(
          'evt-1',
          'agg-1',
          'corr-1',
          'cause-1',
          now,
          { transactionId: 'tx-1', walletId: 'w-1', kind: 'BET', status: 'PROCESSED', amount: '10.00', currency: 'BRL' },
        ),
      ],
      [
        'WagerTransactionRejected',
        new WagerTransactionRejected(
          'evt-2',
          'agg-2',
          'corr-2',
          'cause-2',
          now,
          { transactionId: 'tx-2', walletId: 'w-1', kind: 'BET', reason: 'error', failureCode: 'ERR' },
        ),
      ],
      [
        'WalletBalanceChanged',
        new WalletBalanceChanged(
          'evt-3',
          'agg-3',
          'corr-3',
          'cause-3',
          now,
          { walletId: 'w-1', balanceBefore: '50.00', balanceAfter: '40.00', currency: 'BRL', transactionId: 'tx-3' },
        ),
      ],
      [
        'WagerTransactionPendingReference',
        new WagerTransactionPendingReference(
          'evt-4',
          'agg-4',
          'corr-4',
          'cause-4',
          now,
          { transactionId: 'tx-4', walletId: 'w-1', kind: 'WIN', referenceId: 'ref-1' },
        ),
      ],
    ])('%s carries envelope fields', (_name, evt) => {
      const json = evt.toJSON();
      expect(json.eventId).toBeDefined();
      expect(json.aggregateId).toBeDefined();
      expect(json.correlationId).toBeDefined();
      expect(json.occurredAt).toBeDefined();
      expect(json.version).toBe(1);
    });

    it('should preserve causationId when provided', () => {
      const evt = new WagerTransactionProcessed(
        'evt-1',
        'tx-1',
        'corr-1',
        'cause-1',
        now,
        { transactionId: 'tx-1', walletId: 'w-1', kind: 'BET', status: 'PROCESSED', amount: '10.00', currency: 'BRL' },
      );
      expect(evt.causationId).toBe('cause-1');
      expect(evt.toJSON().causationId).toBe('cause-1');
    });

    it('should set causationId to undefined when omitted', () => {
      const evt = new WagerTransactionProcessed(
        'evt-1',
        'tx-1',
        'corr-1',
        undefined,
        now,
        { transactionId: 'tx-1', walletId: 'w-1', kind: 'BET', status: 'PROCESSED', amount: '10.00', currency: 'BRL' },
      );
      expect(evt.causationId).toBeUndefined();
      expect(evt.toJSON().causationId).toBeUndefined();
    });
  });
});
