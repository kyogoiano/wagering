import { describe, expect, it } from 'bun:test';
import { Wallet } from './wallet.aggregate';
import { Money } from '../money';
import { InsufficientBalanceError, InvalidCurrencyError } from '../errors/domain.error';
import { LedgerDirection } from '../ledger';

describe('Wallet', () => {
  describe('open()', () => {
    it('should create wallet with initial balance', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '1000.00', currency: 'BRL' }),
      });
      expect(wallet.id).toBe('w-1');
      expect(wallet.playerId).toBe('p-1');
      expect(wallet.currency).toBe('BRL');
      expect(wallet.balance.amount).toBe('1000.00');
      expect(wallet.version).toBe(1);
    });

    it('should create wallet with zero balance', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.zero('BRL'),
      });
      expect(wallet.balance.amount).toBe('0.00');
      expect(wallet.version).toBe(0);
    });

    it('should use current date when createdAt is omitted', () => {
      const before = Date.now();
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      const after = Date.now();
      expect(wallet.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(wallet.createdAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('debit()', () => {
    it('should reduce balance and generate DEBIT ledger entry', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      const entry = wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.balance.amount).toBe('75.00');
      expect(wallet.version).toBe(2);
      expect(entry.direction).toBe(LedgerDirection.Debit);
      expect(entry.money.amount).toBe('25.00');
      expect(entry.balanceBefore.amount).toBe('100.00');
      expect(entry.balanceAfter.amount).toBe('75.00');
      expect(entry.isBalanced()).toBe(true);
    });

    it('should throw when balance is insufficient', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }),
      });
      expect(() =>
        wallet.debit(Money.from({ amount: '80.00', currency: 'BRL' }), 'tx-1'),
      ).toThrow(InsufficientBalanceError);
    });

    it('should throw when currency does not match', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      expect(() =>
        wallet.debit(Money.from({ amount: '10.00', currency: 'USD' }), 'tx-1'),
      ).toThrow(InvalidCurrencyError);
    });

    it('should not allow debit equal to balance (results in zero)', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }),
      });
      const entry = wallet.debit(Money.from({ amount: '50.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.balance.amount).toBe('0.00');
      expect(entry.isBalanced()).toBe(true);
    });
  });

  describe('credit()', () => {
    it('should increase balance and generate CREDIT ledger entry', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      const entry = wallet.credit(Money.from({ amount: '50.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.balance.amount).toBe('150.00');
      expect(wallet.version).toBe(2);
      expect(entry.direction).toBe(LedgerDirection.Credit);
      expect(entry.money.amount).toBe('50.00');
      expect(entry.balanceBefore.amount).toBe('100.00');
      expect(entry.balanceAfter.amount).toBe('150.00');
      expect(entry.isBalanced()).toBe(true);
    });

    it('should throw when currency does not match', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      expect(() =>
        wallet.credit(Money.from({ amount: '10.00', currency: 'USD' }), 'tx-1'),
      ).toThrow(InvalidCurrencyError);
    });
  });

  describe('version', () => {
    it('should increment version on each debit', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      expect(wallet.version).toBe(1);
      wallet.debit(Money.from({ amount: '10.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.version).toBe(2);
      wallet.debit(Money.from({ amount: '10.00', currency: 'BRL' }), 'tx-2');
      expect(wallet.version).toBe(3);
    });

    it('should increment version on each credit', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      wallet.credit(Money.from({ amount: '10.00', currency: 'BRL' }), 'tx-1');
      expect(wallet.version).toBe(2);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct wallet from state', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });
      wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx-1');
      const state = wallet.toJSON();
      const rehydrated = Wallet.rehydrate(state);
      expect(rehydrated.id).toBe(wallet.id);
      expect(rehydrated.balance.amount).toBe(wallet.balance.amount);
      expect(rehydrated.version).toBe(wallet.version);
      expect(rehydrated.currency).toBe(wallet.currency);
    });
  });

  describe('toJSON()', () => {
    it('should serialize wallet state', () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
        createdAt: now,
      });
      const state = wallet.toJSON();
      expect(state).toEqual({
        id: 'w-1',
        playerId: 'p-1',
        currency: 'BRL',
        balanceAmount: '100.00',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  describe('balance never negative', () => {
    it('should prevent balance from going negative via debit', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '10.00', currency: 'BRL' }),
      });
      expect(() =>
        wallet.debit(Money.from({ amount: '11.00', currency: 'BRL' }), 'tx-1'),
      ).toThrow(InsufficientBalanceError);
      expect(wallet.balance.isNegative()).toBe(false);
    });
  });
});
