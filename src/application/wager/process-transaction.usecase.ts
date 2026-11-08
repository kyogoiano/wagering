import { createHash } from 'node:crypto';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '@domain/transaction';
import { Money } from '@domain/money';
import { OutboxMessage } from '@domain/messaging/outbox';

export interface ProcessTransactionInput {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  correlationId?: string;
}

export interface ProcessTransactionOutput {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: Money;
  idempotentReplay: boolean;
  events: OutboxMessage[];
}

export function computePayloadHash(input: ProcessTransactionInput): string {
  const canonical = JSON.stringify({
    providerId: input.providerId,
    externalTransactionId: input.externalTransactionId,
    playerId: input.playerId,
    walletId: input.walletId,
    roundId: input.roundId,
    gameId: input.gameId,
    kind: input.kind,
    moneyAmount: input.money.amount,
    moneyCurrency: input.money.currency,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
