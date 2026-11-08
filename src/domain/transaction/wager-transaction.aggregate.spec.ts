import { describe, expect, it } from 'bun:test';
import {
  WagerTransaction,
  computePayloadHash,
} from './wager-transaction.aggregate';
import { WagerTransactionKind, WagerTransactionStatus } from './wager-transaction-types';
import { Money } from '../money';
import { FailureCode } from '../failure';
import { InvalidTransactionStateError } from '../errors/domain.error';
import { LedgerDirection } from '../ledger';

describe('WagerTransaction', () => {
  const baseProps = {
    id: 'tx-1',
    providerId: 'provider-a',
    externalTransactionId: 'ext-123',
    idempotencyKey: 'provider-a:ext-123',
    payload: { kind: 'BET', money: { amount: '25.00', currency: 'BRL' } },
    walletId: 'w-1',
    playerId: 'p-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
  };

  describe('create()', () => {
    it('should create BET transaction in PENDING status', () => {
      const tx = WagerTransaction.create(baseProps);
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.kind).toBe(WagerTransactionKind.Bet);
      expect(tx.isTerminal()).toBe(false);
    });

    it('should create WIN transaction in PENDING status', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Win,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
    });

    it('should create LOSS transaction in PENDING status', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Loss,
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
    });

    it('should create REFUND with reference in PENDING status', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'ext-ref-1',
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
    });

    it('should create REFUND without reference in PENDING_REFERENCE status', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Refund,
      });
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
    });

    it('should create ROLLBACK without reference in PENDING_REFERENCE status', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Rollback,
      });
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
    });
  });

  describe('state transitions', () => {
    it('should transition PENDING → PROCESSED', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.markProcessed(undefined);
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.isTerminal()).toBe(true);
      expect(tx.processedAt).toBeDefined();
    });

    it('should transition PENDING → REJECTED', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.INSUFFICIENT_BALANCE);
    });

    it('should transition PENDING → FAILED', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.fail(FailureCode.DATABASE_ERROR);
      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.failureCode).toBe(FailureCode.DATABASE_ERROR);
    });

    it('should transition PENDING → PENDING_REFERENCE', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.markPendingReference();
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
    });

    it('should transition PENDING_REFERENCE → PROCESSED', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Refund,
      });
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
      tx.markProcessed('ref-tx-1');
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.referenceTransactionId).toBe('ref-tx-1');
    });

    it('should not transition from terminal state PROCESSED', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.markProcessed(undefined);
      expect(() => tx.reject(FailureCode.INSUFFICIENT_BALANCE)).toThrow(
        InvalidTransactionStateError,
      );
    });

    it('should not transition from terminal state REJECTED', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      expect(() => tx.markProcessed(undefined)).toThrow(InvalidTransactionStateError);
    });

    it('should not transition from terminal state FAILED', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.fail(FailureCode.DATABASE_ERROR);
      expect(() => tx.markProcessed(undefined)).toThrow(InvalidTransactionStateError);
    });
  });

  describe('affectsBalance()', () => {
    it('should return true for BET', () => {
      const tx = WagerTransaction.create(baseProps);
      expect(tx.affectsBalance()).toBe(true);
    });

    it('should return true for WIN', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Win,
      });
      expect(tx.affectsBalance()).toBe(true);
    });

    it('should return false for LOSS', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Loss,
      });
      expect(tx.affectsBalance()).toBe(false);
    });

    it('should return false for REJECTED transaction', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.reject(FailureCode.INSUFFICIENT_BALANCE);
      expect(tx.affectsBalance()).toBe(false);
    });
  });

  describe('requiresReference()', () => {
    it('should return true for REFUND', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Refund,
      });
      expect(tx.requiresReference()).toBe(true);
    });

    it('should return true for ROLLBACK', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Rollback,
      });
      expect(tx.requiresReference()).toBe(true);
    });

    it('should return false for BET', () => {
      const tx = WagerTransaction.create(baseProps);
      expect(tx.requiresReference()).toBe(false);
    });
  });

  describe('ledgerDirectionFor()', () => {
    it('should return DEBIT for BET', () => {
      const tx = WagerTransaction.create(baseProps);
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    });

    it('should return CREDIT for WIN', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Win,
      });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it('should return CREDIT for REFUND', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Refund,
      });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it('should return CREDIT for ROLLBACK of BET', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Rollback,
      });
      const ref = WagerTransaction.create(baseProps);
      expect(tx.ledgerDirectionFor(ref)).toBe(LedgerDirection.Credit);
    });

    it('should return DEBIT for ROLLBACK of WIN', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Rollback,
      });
      const ref = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Win,
      });
      expect(tx.ledgerDirectionFor(ref)).toBe(LedgerDirection.Debit);
    });

    it('should return CREDIT for OPENING', () => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind: WagerTransactionKind.Opening,
      });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });
  });

  describe('matchesPayload()', () => {
    it('should return true for matching hash', () => {
      const tx = WagerTransaction.create(baseProps);
      expect(tx.matchesPayload(tx.payloadHash)).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const tx = WagerTransaction.create(baseProps);
      expect(tx.matchesPayload('different-hash')).toBe(false);
    });
  });

  describe('computePayloadHash()', () => {
    it('should produce deterministic hash', () => {
      const payload = { kind: 'BET', money: { amount: '25.00' } };
      const hash1 = computePayloadHash(payload);
      const hash2 = computePayloadHash(payload);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different payload', () => {
      const hash1 = computePayloadHash({ kind: 'BET', money: { amount: '25.00' } });
      const hash2 = computePayloadHash({ kind: 'WIN', money: { amount: '25.00' } });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct from state', () => {
      const tx = WagerTransaction.create(baseProps);
      tx.markProcessed(undefined, new Date('2024-01-01T00:00:00Z'));
      const state = tx.toJSON();
      const rehydrated = WagerTransaction.rehydrate(state);
      expect(rehydrated.id).toBe(tx.id);
      expect(rehydrated.status).toBe(tx.status);
      expect(rehydrated.kind).toBe(tx.kind);
      expect(rehydrated.money.amount).toBe(tx.money.amount);
    });
  });

  describe('parametrized — kinds', () => {
    it.each([
      [WagerTransactionKind.Bet, false],
      [WagerTransactionKind.Win, false],
      [WagerTransactionKind.Loss, false],
      [WagerTransactionKind.Refund, true],
      [WagerTransactionKind.Rollback, true],
      [WagerTransactionKind.Opening, false],
    ])('kind %s requiresReference: %s', (kind, expected) => {
      const tx = WagerTransaction.create({
        ...baseProps,
        kind,
      });
      expect(tx.requiresReference()).toBe(expected);
    });
  });
});
