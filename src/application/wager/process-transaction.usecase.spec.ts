import { describe, expect, it } from 'bun:test';
import { computePayloadHash, ProcessTransactionInput } from './process-transaction.usecase';
import { Money } from '@domain/money';
import { WagerTransactionKind } from '@domain/transaction';

describe('computePayloadHash', () => {
  const baseInput: ProcessTransactionInput = {
    idempotencyKey: 'key-1',
    providerId: 'provider-a',
    externalTransactionId: 'tx-123',
    playerId: 'player-1',
    walletId: 'wallet-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
    correlationId: 'corr-1',
  };

  it('should produce a hex string', () => {
    const hash = computePayloadHash(baseInput);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    const hash1 = computePayloadHash(baseInput);
    const hash2 = computePayloadHash(baseInput);
    expect(hash1).toBe(hash2);
  });

  it('should ignore idempotencyKey in hash', () => {
    const input1: ProcessTransactionInput = { ...baseInput, idempotencyKey: 'key-1' };
    const input2: ProcessTransactionInput = { ...baseInput, idempotencyKey: 'key-2' };
    expect(computePayloadHash(input1)).toBe(computePayloadHash(input2));
  });

  it('should ignore correlationId in hash', () => {
    const input1: ProcessTransactionInput = { ...baseInput, correlationId: 'corr-1' };
    const input2: ProcessTransactionInput = { ...baseInput, correlationId: 'corr-2' };
    expect(computePayloadHash(input1)).toBe(computePayloadHash(input2));
  });

  it('should change when kind changes', () => {
    const input1: ProcessTransactionInput = { ...baseInput, kind: WagerTransactionKind.Bet };
    const input2: ProcessTransactionInput = { ...baseInput, kind: WagerTransactionKind.Win };
    expect(computePayloadHash(input1)).not.toBe(computePayloadHash(input2));
  });

  it('should change when amount changes', () => {
    const input1: ProcessTransactionInput = {
      ...baseInput,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
    };
    const input2: ProcessTransactionInput = {
      ...baseInput,
      money: Money.from({ amount: '30.00', currency: 'BRL' }),
    };
    expect(computePayloadHash(input1)).not.toBe(computePayloadHash(input2));
  });

  it('should change when walletId changes', () => {
    const input1: ProcessTransactionInput = { ...baseInput, walletId: 'wallet-1' };
    const input2: ProcessTransactionInput = { ...baseInput, walletId: 'wallet-2' };
    expect(computePayloadHash(input1)).not.toBe(computePayloadHash(input2));
  });

  it('should ignore referenceExternalTransactionId in hash', () => {
    const input1: ProcessTransactionInput = { ...baseInput, referenceExternalTransactionId: undefined };
    const input2: ProcessTransactionInput = { ...baseInput, referenceExternalTransactionId: 'ref-1' };
    expect(computePayloadHash(input1)).toBe(computePayloadHash(input2));
  });
});
