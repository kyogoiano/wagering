import Decimal from 'decimal.js';
import { MoneyProps } from './money-props';
import { InvalidAmountError, InvalidCurrencyError } from '../errors/domain.error';

// Configure Decimal for financial precision
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -20,
  toExpPos: 20,
});

export class Money {
  private readonly value: Decimal;
  public readonly currency: string;

  private constructor(value: Decimal, currency: string) {
    this.value = value;
    this.currency = currency;
  }

  static from(props: MoneyProps): Money {
    this.validateAmount(props.amount);
    const decimal = new Decimal(props.amount);
    return new Money(decimal, props.currency);
  }

  static zero(currency: string): Money {
    return new Money(new Decimal(0), currency);
  }

  static fromDecimal(value: Decimal, currency: string): Money {
    return new Money(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromDecimal(this.value.add(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromDecimal(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return Money.fromDecimal(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  isLessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThanOrEqualTo(other.value);
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) return false;
    return this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  get amount(): string {
    return this.value.toFixed(2);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new InvalidCurrencyError(
        `Cannot operate on different currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }

  private static validateAmount(amount: string): void {
    if (typeof amount !== 'string' || amount.trim() === '') {
      throw new InvalidAmountError(amount);
    }

    // Reject scientific notation
    if (/e/i.test(amount)) {
      throw new InvalidAmountError(amount);
    }

    // Reject NaN, Infinity
    const lower = amount.toLowerCase().trim();
    if (lower === 'nan' || lower === 'infinity' || lower === 'inf') {
      throw new InvalidAmountError(amount);
    }

    // Validate decimal format
    if (!/^\-?\d+(\.\d{1,2})?$/.test(amount.trim())) {
      throw new InvalidAmountError(amount);
    }
  }
}
