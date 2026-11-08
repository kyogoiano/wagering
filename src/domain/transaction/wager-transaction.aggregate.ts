import { createHash } from 'node:crypto';
import { Money } from '../money';
import { FailureCode } from '@domain/failure';
import { LedgerDirection } from '@domain/ledger';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  isTerminalStatus,
} from './wager-transaction-types';
import { InvalidTransactionStateError } from '../errors/domain.error';

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  moneyAmount: string;
  moneyCurrency: string;
  referenceExternalTransactionId: string | undefined;
  status: WagerTransactionStatus;
  referenceTransactionId: string | undefined;
  failureCode: string | undefined;
  createdAt: Date;
  processedAt: Date | undefined;
}

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt?: Date;
}

export function computePayloadHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

export class WagerTransaction {
  private _status: WagerTransactionStatus;
  private _referenceTransactionId: string | undefined;
  private _failureCode: string | undefined;
  private _processedAt: Date | undefined;

  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    status: WagerTransactionStatus,
    referenceTransactionId?: string,
    failureCode?: string,
    processedAt?: Date,
  ) {
    this._status = status;
    this._referenceTransactionId = referenceTransactionId;
    this._failureCode = failureCode;
    this._processedAt = processedAt;
  }

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    const now = props.createdAt ?? new Date();
    const hash = computePayloadHash(props.payload);

    let status = WagerTransactionStatus.Pending;

    // If reference is required but not provided, mark as pending reference
    if (this.requiresReference(props.kind) && !props.referenceExternalTransactionId) {
      status = WagerTransactionStatus.PendingReference;
    }

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      hash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      now,
      status,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    const money = Money.from({ amount: state.moneyAmount, currency: state.moneyCurrency });
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      money,
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): string | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date = new Date()): void {
    if (isTerminalStatus(this._status)) {
      throw new InvalidTransactionStateError(this._status, 'markProcessed');
    }
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
  }

  markPendingReference(): void {
    if (isTerminalStatus(this._status)) {
      throw new InvalidTransactionStateError(this._status, 'markPendingReference');
    }
    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: FailureCode, at: Date = new Date()): void {
    if (isTerminalStatus(this._status)) {
      throw new InvalidTransactionStateError(this._status, 'reject');
    }
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._processedAt = at;
  }

  fail(code: FailureCode, at: Date = new Date()): void {
    if (isTerminalStatus(this._status)) {
      throw new InvalidTransactionStateError(this._status, 'fail');
    }
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._processedAt = at;
  }

  isTerminal(): boolean {
    return isTerminalStatus(this._status);
  }

  affectsBalance(): boolean {
    // LOSS does not affect balance; REJECTED transactions don't either
    if (this._status === WagerTransactionStatus.Rejected) {
      return false;
    }
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return (
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Win:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Rollback:
        // Inverse of the reference
        if (reference?.kind === WagerTransactionKind.Bet) {
          return LedgerDirection.Credit;
        }
        if (reference?.kind === WagerTransactionKind.Win) {
          return LedgerDirection.Debit;
        }
        if (reference?.kind === WagerTransactionKind.Refund) {
          return LedgerDirection.Debit;
        }
        return LedgerDirection.Debit;
      case WagerTransactionKind.Opening:
        return LedgerDirection.Credit;
      default:
        throw new Error(`No ledger direction for kind: ${this.kind}`);
    }
  }

  toJSON(): WagerTransactionState {
    return {
      id: this.id,
      providerId: this.providerId,
      externalTransactionId: this.externalTransactionId,
      idempotencyKey: this.idempotencyKey,
      payloadHash: this.payloadHash,
      walletId: this.walletId,
      playerId: this.playerId,
      roundId: this.roundId,
      gameId: this.gameId,
      kind: this.kind,
      moneyAmount: this.money.amount,
      moneyCurrency: this.money.currency,
      referenceExternalTransactionId: this.referenceExternalTransactionId,
      status: this._status,
      referenceTransactionId: this._referenceTransactionId,
      failureCode: this._failureCode,
      createdAt: this.createdAt,
      processedAt: this._processedAt,
    };
  }

  private static requiresReference(kind: WagerTransactionKind): boolean {
    return kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;
  }
}
