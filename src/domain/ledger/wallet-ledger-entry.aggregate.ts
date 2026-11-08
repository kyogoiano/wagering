import { Money } from '@domain/money';
import {
  LedgerDirection,
  LedgerEntryState,
  CreateLedgerEntryProps,
} from './ledger-types';

export class WalletLedgerEntry {
  public readonly id: string;
  public readonly walletId: string;
  public readonly transactionId: string;
  public readonly direction: LedgerDirection;
  public readonly money: Money;
  public readonly balanceBefore: Money;
  public readonly balanceAfter: Money;
  public readonly createdAt: Date;

  private constructor(props: {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.walletId = props.walletId;
    this.transactionId = props.transactionId;
    this.direction = props.direction;
    this.money = props.money;
    this.balanceBefore = props.balanceBefore;
    this.balanceAfter = props.balanceAfter;
    this.createdAt = props.createdAt;
  }

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    const money = Money.from({ amount: props.amount, currency: props.currency });
    const balanceBefore = Money.from({ amount: props.balanceBefore, currency: props.currency });
    const balanceAfter = Money.from({ amount: props.balanceAfter, currency: props.currency });

    const entry = new WalletLedgerEntry({
      id: props.id,
      walletId: props.walletId,
      transactionId: props.transactionId,
      direction: props.direction,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: props.createdAt ?? new Date(),
    });

    if (!entry.isBalanced()) {
      throw new Error(
        `Ledger entry is not balanced: ${props.balanceBefore} ${props.direction === LedgerDirection.Debit ? '-' : '+'} ${props.amount} !== ${props.balanceAfter}`,
      );
    }

    Object.freeze(entry);
    return entry;
  }

  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry({
      id: state.id,
      walletId: state.walletId,
      transactionId: state.transactionId,
      direction: state.direction,
      money: Money.from({ amount: state.amount, currency: state.currency }),
      balanceBefore: Money.from({ amount: state.balanceBefore, currency: state.currency }),
      balanceAfter: Money.from({ amount: state.balanceAfter, currency: state.currency }),
      createdAt: state.createdAt,
    });
  }

  isBalanced(): boolean {
    const expected =
      this.direction === LedgerDirection.Debit
        ? this.balanceBefore.subtract(this.money)
        : this.balanceBefore.add(this.money);
    return expected.equals(this.balanceAfter);
  }

  toJSON(): LedgerEntryState {
    return {
      id: this.id,
      walletId: this.walletId,
      transactionId: this.transactionId,
      direction: this.direction,
      amount: this.money.amount,
      currency: this.money.currency,
      balanceBefore: this.balanceBefore.amount,
      balanceAfter: this.balanceAfter.amount,
      createdAt: this.createdAt,
    };
  }
}
