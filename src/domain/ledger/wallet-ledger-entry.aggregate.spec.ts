import { describe, expect, it } from 'bun:test';
import { WalletLedgerEntry } from './wallet-ledger-entry.aggregate';
import { LedgerDirection } from './ledger-types';
import type { CreateLedgerEntryProps } from './ledger-types';

describe('WalletLedgerEntry', () => {
  const baseProps: CreateLedgerEntryProps = {
    id: 'entry-1',
    walletId: 'wallet-1',
    transactionId: 'tx-1',
    direction: LedgerDirection.Debit,
    amount: '10.00',
    currency: 'BRL',
    balanceBefore: '50.00',
    balanceAfter: '40.00',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  describe('create()', () => {
    it('should create a valid DEBIT entry', () => {
      const entry = WalletLedgerEntry.create(baseProps);
      expect(entry.id).toBe('entry-1');
      expect(entry.walletId).toBe('wallet-1');
      expect(entry.direction).toBe(LedgerDirection.Debit);
      expect(entry.money.amount).toBe('10.00');
      expect(entry.balanceBefore.amount).toBe('50.00');
      expect(entry.balanceAfter.amount).toBe('40.00');
    });

    it('should create a valid CREDIT entry', () => {
      const props: CreateLedgerEntryProps = {
        ...baseProps,
        direction: LedgerDirection.Credit,
        balanceAfter: '60.00',
      };
      const entry = WalletLedgerEntry.create(props);
      expect(entry.direction).toBe(LedgerDirection.Credit);
      expect(entry.balanceAfter.amount).toBe('60.00');
    });

    it('should reject unbalanced DEBIT entry', () => {
      const props: CreateLedgerEntryProps = {
        ...baseProps,
        balanceAfter: '30.00', // should be 40.00
      };
      expect(() => WalletLedgerEntry.create(props)).toThrow('not balanced');
    });

    it('should reject unbalanced CREDIT entry', () => {
      const props: CreateLedgerEntryProps = {
        ...baseProps,
        direction: LedgerDirection.Credit,
        balanceAfter: '30.00', // should be 60.00
      };
      expect(() => WalletLedgerEntry.create(props)).toThrow('not balanced');
    });

    it('should use current date when createdAt is omitted', () => {
      const before = Date.now();
      const entry = WalletLedgerEntry.create({ ...baseProps, createdAt: undefined });
      const after = Date.now();
      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('isBalanced()', () => {
    it('should return true for balanced DEBIT', () => {
      const entry = WalletLedgerEntry.create(baseProps);
      expect(entry.isBalanced()).toBe(true);
    });

    it('should return true for balanced CREDIT', () => {
      const props: CreateLedgerEntryProps = {
        ...baseProps,
        direction: LedgerDirection.Credit,
        balanceAfter: '60.00',
      };
      const entry = WalletLedgerEntry.create(props);
      expect(entry.isBalanced()).toBe(true);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct from state', () => {
      const entry = WalletLedgerEntry.create(baseProps);
      const state = entry.toJSON();
      const rehydrated = WalletLedgerEntry.rehydrate(state);
      expect(rehydrated.id).toBe(entry.id);
      expect(rehydrated.walletId).toBe(entry.walletId);
      expect(rehydrated.money.amount).toBe(entry.money.amount);
      expect(rehydrated.balanceBefore.amount).toBe(entry.balanceBefore.amount);
      expect(rehydrated.balanceAfter.amount).toBe(entry.balanceAfter.amount);
    });
  });

  describe('immutability', () => {
    it('should not allow mutation after creation', () => {
      const entry = WalletLedgerEntry.create(baseProps);
      expect(() => {
        // @ts-expect-error — testing immutability
        (entry as any).direction = LedgerDirection.Credit;
      }).toThrow();
    });
  });

  describe('toJSON()', () => {
    it('should serialize to LedgerEntryState', () => {
      const entry = WalletLedgerEntry.create(baseProps);
      const json = entry.toJSON();
      expect(json).toEqual({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Debit,
        amount: '10.00',
        currency: 'BRL',
        balanceBefore: '50.00',
        balanceAfter: '40.00',
        createdAt: expect.any(Date),
      });
    });
  });
});
