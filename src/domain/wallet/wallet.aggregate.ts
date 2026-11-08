import { Money } from '../money';
import { WalletLedgerEntry } from '@domain/ledger';
import { LedgerDirection } from '@domain/ledger';
import { InsufficientBalanceError, InvalidCurrencyError } from '../errors/domain.error';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balanceAmount: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  createdAt?: Date;
}

export class Wallet {
  private _balance: Money;
  private _version: number;
  private _updatedAt: Date;

  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    balance: Money,
    version: number,
    public readonly createdAt: Date,
    updatedAt: Date,
  ) {
    this._balance = balance;
    this._version = version;
    this._updatedAt = updatedAt;
  }

  static open(props: OpenWalletProps): Wallet {
    const now = props.createdAt ?? new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      props.initialBalance.isZero() ? 0 : 1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    const balance = Money.from({ amount: state.balanceAmount, currency: state.currency });
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertSameCurrency(amount);
    if (this._balance.isLessThan(amount)) {
      throw new InsufficientBalanceError(this._balance.amount, amount.amount);
    }
    const balanceBefore = this._balance;
    this._balance = this._balance.subtract(amount);
    this._version++;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      id: `${this.id}-ledger-${transactionId}`,
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Debit,
      amount: amount.amount,
      currency: this.currency,
      balanceBefore: balanceBefore.amount,
      balanceAfter: this._balance.amount,
    });
  }

  credit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertSameCurrency(amount);
    const balanceBefore = this._balance;
    this._balance = this._balance.add(amount);
    this._version++;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      id: `${this.id}-ledger-${transactionId}`,
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      amount: amount.amount,
      currency: this.currency,
      balanceBefore: balanceBefore.amount,
      balanceAfter: this._balance.amount,
    });
  }

  toJSON(): WalletState {
    return {
      id: this.id,
      playerId: this.playerId,
      currency: this.currency,
      balanceAmount: this._balance.amount,
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new InvalidCurrencyError(
        `Wallet currency ${this.currency} does not match operation currency ${money.currency}`,
      );
    }
  }
}
