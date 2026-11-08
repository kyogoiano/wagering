import { describe, expect, it } from 'bun:test';
import { OutboxMessage } from './outbox-message.aggregate';
import { DEFAULT_BACKOFF_CONFIG } from './outbox-types';
import type { EnqueueOutboxProps } from './outbox-types';

describe('OutboxMessage', () => {
  const baseProps: EnqueueOutboxProps = {
    id: 'evt-001',
    aggregateId: 'tx-001',
    eventType: 'WagerTransactionProcessed',
    payload: { walletId: 'w-1', amount: '10.00', currency: 'BRL' },
    occurredAt: new Date('2024-01-01T00:00:00Z'),
  };

  describe('enqueue()', () => {
    it('should create a pending outbox message', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      expect(msg.id).toBe('evt-001');
      expect(msg.aggregateId).toBe('tx-001');
      expect(msg.eventType).toBe('WagerTransactionProcessed');
      expect(msg.attempts).toBe(0);
      expect(msg.isPending()).toBe(true);
      expect(msg.publishedAt).toBeUndefined();
    });

    it('should set nextAttemptAt to occurredAt on enqueue', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      expect(msg.nextAttemptAt).toEqual(new Date('2024-01-01T00:00:00Z'));
    });

    it('should use current date when occurredAt is omitted', () => {
      const before = Date.now();
      const msg = OutboxMessage.enqueue({ ...baseProps, occurredAt: undefined });
      const after = Date.now();
      expect(msg.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(msg.occurredAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should freeze the payload', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      expect(() => {
        // @ts-expect-error — testing immutability
        (msg.payload as any).walletId = 'hacked';
      }).toThrow();
    });
  });

  describe('isDue()', () => {
    it('should be due immediately after enqueue', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      expect(msg.isDue(new Date('2024-01-01T00:00:00Z'))).toBe(true);
    });

    it('should not be due before nextAttemptAt', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      expect(msg.isDue(new Date('2023-12-31T23:59:59Z'))).toBe(false);
    });
  });

  describe('scheduleRetry() — backoff exponencial', () => {
    const now = new Date('2024-01-01T00:00:00Z');

    it('should increment attempts', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      msg.scheduleRetry(now);
      expect(msg.attempts).toBe(1);
    });

    it.each([
      [1, 1_000],
      [2, 2_000],
      [3, 4_000],
      [4, 8_000],
      [5, 16_000],
    ])(
      'attempt %d should have delay %dms',
      (attempt, expectedDelay) => {
        const msg = OutboxMessage.enqueue(baseProps);
        for (let i = 0; i < attempt; i++) {
          msg.scheduleRetry(now);
        }
        const delay = msg.nextAttemptAt.getTime() - now.getTime();
        expect(delay).toBe(expectedDelay);
      },
    );

    it('should cap delay at maxDelayMs', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      // After 5 attempts: base * 2^4 = 16s, still under 60s
      for (let i = 0; i < 5; i++) {
        msg.scheduleRetry(now);
      }
      expect(msg.nextAttemptAt.getTime() - now.getTime()).toBeLessThanOrEqual(
        DEFAULT_BACKOFF_CONFIG.maxDelayMs,
      );
    });

    it('should respect custom backoff config', () => {
      const config = { baseDelayMs: 500, maxDelayMs: 5_000, maxAttempts: 3 };
      const msg = OutboxMessage.enqueue(baseProps);
      msg.scheduleRetry(now, config);
      expect(msg.attempts).toBe(1);
      expect(msg.nextAttemptAt.getTime() - now.getTime()).toBe(500);
      msg.scheduleRetry(now, config);
      expect(msg.nextAttemptAt.getTime() - now.getTime()).toBe(1_000);
      msg.scheduleRetry(now, config);
      expect(msg.nextAttemptAt.getTime() - now.getTime()).toBe(2_000);
    });
  });

  describe('isExhausted()', () => {
    it('should not be exhausted on enqueue', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      expect(msg.isExhausted()).toBe(false);
    });

    it('should be exhausted after maxAttempts', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      const now = new Date();
      for (let i = 0; i < DEFAULT_BACKOFF_CONFIG.maxAttempts; i++) {
        msg.scheduleRetry(now);
      }
      expect(msg.isExhausted()).toBe(true);
    });

    it('should not be exhausted before maxAttempts', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      const now = new Date();
      for (let i = 0; i < DEFAULT_BACKOFF_CONFIG.maxAttempts - 1; i++) {
        msg.scheduleRetry(now);
      }
      expect(msg.isExhausted()).toBe(false);
    });
  });

  describe('markPublished()', () => {
    it('should mark message as published', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      const publishedAt = new Date('2024-01-01T00:01:00Z');
      msg.markPublished(publishedAt);
      expect(msg.isPending()).toBe(false);
      expect(msg.publishedAt).toEqual(publishedAt);
    });

    it('should use current date when no time provided', () => {
      const before = Date.now();
      const msg = OutboxMessage.enqueue(baseProps);
      msg.markPublished();
      const after = Date.now();
      expect(msg.publishedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(msg.publishedAt!.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct pending message from state', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      const state = msg.toJSON();
      const rehydrated = OutboxMessage.rehydrate(state);
      expect(rehydrated.id).toBe(msg.id);
      expect(rehydrated.aggregateId).toBe(msg.aggregateId);
      expect(rehydrated.eventType).toBe(msg.eventType);
      expect(rehydrated.isPending()).toBe(true);
      expect(rehydrated.attempts).toBe(0);
    });

    it('should reconstruct retried message from state', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      const now = new Date('2024-01-01T00:00:00Z');
      msg.scheduleRetry(now);
      msg.scheduleRetry(now);
      const state = msg.toJSON();
      const rehydrated = OutboxMessage.rehydrate(state);
      expect(rehydrated.attempts).toBe(2);
      expect(rehydrated.isPending()).toBe(true);
    });

    it('should reconstruct published message from state', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      msg.markPublished(new Date('2024-01-01T00:01:00Z'));
      const state = msg.toJSON();
      const rehydrated = OutboxMessage.rehydrate(state);
      expect(rehydrated.isPending()).toBe(false);
      expect(rehydrated.publishedAt).toEqual(new Date('2024-01-01T00:01:00Z'));
    });
  });

  describe('toJSON()', () => {
    it('should serialize pending message', () => {
      const msg = OutboxMessage.enqueue(baseProps);
      const json = msg.toJSON();
      expect(json).toEqual({
        id: 'evt-001',
        aggregateId: 'tx-001',
        eventType: 'WagerTransactionProcessed',
        payload: { walletId: 'w-1', amount: '10.00', currency: 'BRL' },
        occurredAt: new Date('2024-01-01T00:00:00Z'),
        attempts: 0,
        nextAttemptAt: new Date('2024-01-01T00:00:00Z'),
        publishedAt: undefined,
      });
    });
  });
});
