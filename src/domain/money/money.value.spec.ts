import { describe, expect, it } from 'bun:test';
import { Money } from './money.value';
import { InvalidAmountError, InvalidCurrencyError } from '../errors/domain.error';

describe('Money', () => {
  describe('from()', () => {
    it('should create Money from valid amount string', () => {
      const money = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(money.currency).toBe('BRL');
      expect(money.amount).toBe('25.00');
    });

    it('should create Money from integer string', () => {
      const money = Money.from({ amount: '100', currency: 'USD' });
      expect(money.amount).toBe('100.00');
    });

    it('should create Money from single decimal place', () => {
      const money = Money.from({ amount: '10.5', currency: 'BRL' });
      expect(money.amount).toBe('10.50');
    });

    it('should create Money with negative amount', () => {
      const money = Money.from({ amount: '-10.00', currency: 'BRL' });
      expect(money.amount).toBe('-10.00');
      expect(money.isNegative()).toBe(true);
    });

    it('should reject empty string', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow(InvalidAmountError);
    });

    it('should reject NaN', () => {
      expect(() => Money.from({ amount: 'NaN', currency: 'BRL' })).toThrow(InvalidAmountError);
    });

    it('should reject Infinity', () => {
      expect(() => Money.from({ amount: 'Infinity', currency: 'BRL' })).toThrow(InvalidAmountError);
    });

    it('should reject scientific notation', () => {
      expect(() => Money.from({ amount: '1e2', currency: 'BRL' })).toThrow(InvalidAmountError);
    });

    it('should reject more than 2 decimal places', () => {
      expect(() => Money.from({ amount: '25.123', currency: 'BRL' })).toThrow(InvalidAmountError);
    });

    it('should reject whitespace-only string', () => {
      expect(() => Money.from({ amount: '   ', currency: 'BRL' })).toThrow(InvalidAmountError);
    });
  });

  describe('zero()', () => {
    it('should create zero Money for given currency', () => {
      const money = Money.zero('BRL');
      expect(money.amount).toBe('0.00');
      expect(money.currency).toBe('BRL');
      expect(money.isZero()).toBe(true);
    });
  });

  describe('arithmetic operations', () => {
    it('should add two Money instances', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '25.50', currency: 'BRL' });
      const result = a.add(b);
      expect(result.amount).toBe('35.50');
      expect(result.currency).toBe('BRL');
    });

    it('should subtract two Money instances', () => {
      const a = Money.from({ amount: '50.00', currency: 'BRL' });
      const b = Money.from({ amount: '25.50', currency: 'BRL' });
      const result = a.subtract(b);
      expect(result.amount).toBe('24.50');
      expect(result.currency).toBe('BRL');
    });

    it('should negate Money', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const result = a.negate();
      expect(result.amount).toBe('-10.00');
    });

    it('should be immutable — add does not modify original', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '20.00', currency: 'BRL' });
      a.add(b);
      expect(a.amount).toBe('10.00');
    });

    it('should be immutable — subtract does not modify original', () => {
      const a = Money.from({ amount: '30.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      a.subtract(b);
      expect(a.amount).toBe('30.00');
    });

    it('should throw when adding different currencies', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => a.add(b)).toThrow(InvalidCurrencyError);
    });

    it('should throw when subtracting different currencies', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => a.subtract(b)).toThrow(InvalidCurrencyError);
    });
  });

  describe('comparison', () => {
    it('should check isZero', () => {
      expect(Money.zero('BRL').isZero()).toBe(true);
      expect(Money.from({ amount: '0.00', currency: 'BRL' }).isZero()).toBe(true);
      expect(Money.from({ amount: '0.01', currency: 'BRL' }).isZero()).toBe(false);
    });

    it('should check isPositive', () => {
      expect(Money.from({ amount: '0.01', currency: 'BRL' }).isPositive()).toBe(true);
      expect(Money.zero('BRL').isPositive()).toBe(false);
      expect(Money.from({ amount: '-1.00', currency: 'BRL' }).isPositive()).toBe(false);
    });

    it('should check isNegative', () => {
      expect(Money.from({ amount: '-1.00', currency: 'BRL' }).isNegative()).toBe(true);
      expect(Money.zero('BRL').isNegative()).toBe(false);
      expect(Money.from({ amount: '1.00', currency: 'BRL' }).isNegative()).toBe(false);
    });

    it('should check isLessThan', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '20.00', currency: 'BRL' });
      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
      expect(a.isLessThan(a)).toBe(false);
    });

    it('should check isGreaterThan', () => {
      const a = Money.from({ amount: '20.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.isGreaterThan(b)).toBe(true);
      expect(b.isGreaterThan(a)).toBe(false);
    });

    it('should check isLessThanOrEqual', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.isLessThanOrEqual(b)).toBe(true);
    });

    it('should check equals — same value and currency', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.equals(b)).toBe(true);
    });

    it('should check equals — different value', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '20.00', currency: 'BRL' });
      expect(a.equals(b)).toBe(false);
    });

    it('should check equals — different currency', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'USD' });
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const money = Money.from({ amount: '25.50', currency: 'BRL' });
      const json = money.toJSON();
      expect(json).toEqual({ amount: '25.50', currency: 'BRL' });
    });

    it('should serialize zero to JSON', () => {
      const money = Money.zero('USD');
      const json = money.toJSON();
      expect(json).toEqual({ amount: '0.00', currency: 'USD' });
    });

    it('should convert to string', () => {
      const money = Money.from({ amount: '25.50', currency: 'BRL' });
      expect(money.toString()).toBe('25.50 BRL');
    });
  });

  describe('parametrized — invalid inputs', () => {
    it.each([
      ['empty string', ''],
      ['whitespace', '   '],
      ['NaN', 'NaN'],
      ['Infinity', 'Infinity'],
      ['scientific notation', '1e2'],
      ['3 decimal places', '1.123'],
      ['4 decimal places', '1.1234'],
      ['letters', 'abc'],
      ['mixed', '10abc'],
    ])('should reject %s', (_label: string, value: string) => {
      expect(() => Money.from({ amount: value, currency: 'BRL' })).toThrow(InvalidAmountError);
    });
  });

  describe('parametrized — valid inputs', () => {
    it.each([
      ['integer', '100', '100.00'],
      ['one decimal', '10.5', '10.50'],
      ['two decimals', '10.55', '10.55'],
      ['zero', '0', '0.00'],
      ['zero explicit', '0.00', '0.00'],
      ['negative', '-5.00', '-5.00'],
      ['large value', '999999999.99', '999999999.99'],
    ])('should accept %s: %s → %s', (_label: string, input: string, expected: string) => {
      const money = Money.from({ amount: input, currency: 'BRL' });
      expect(money.amount).toBe(expected);
    });
  });
});
