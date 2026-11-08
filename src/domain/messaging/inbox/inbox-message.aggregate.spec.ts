import { describe, expect, it } from 'bun:test';
import { InboxMessage } from './inbox-message.aggregate';
import type { ReceiveInboxProps } from './inbox-types';

describe('InboxMessage', () => {
  const baseProps: ReceiveInboxProps = {
    messageId: 'msg-001',
    consumerName: 'wager-consumer',
    payloadHash: 'abc123',
    receivedAt: new Date('2024-01-01T00:00:00Z'),
  };

  describe('receive()', () => {
    it('should create a new inbox message', () => {
      const msg = InboxMessage.receive(baseProps);
      expect(msg.messageId).toBe('msg-001');
      expect(msg.consumerName).toBe('wager-consumer');
      expect(msg.payloadHash).toBe('abc123');
      expect(msg.receivedAt).toEqual(new Date('2024-01-01T00:00:00Z'));
    });

    it('should use current date when receivedAt is omitted', () => {
      const before = Date.now();
      const msg = InboxMessage.receive({ ...baseProps, receivedAt: undefined });
      const after = Date.now();
      expect(msg.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(msg.receivedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should start as not processed', () => {
      const msg = InboxMessage.receive(baseProps);
      expect(msg.isProcessed()).toBe(false);
      expect(msg.processedAt).toBeUndefined();
    });
  });

  describe('markProcessed()', () => {
    it('should mark message as processed with explicit time', () => {
      const msg = InboxMessage.receive(baseProps);
      const processedAt = new Date('2024-01-01T00:01:00Z');
      msg.markProcessed(processedAt);
      expect(msg.isProcessed()).toBe(true);
      expect(msg.processedAt).toEqual(processedAt);
    });

    it('should use current date when no time is provided', () => {
      const before = Date.now();
      const msg = InboxMessage.receive(baseProps);
      msg.markProcessed();
      const after = Date.now();
      expect(msg.isProcessed()).toBe(true);
      expect(msg.processedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(msg.processedAt!.getTime()).toBeLessThanOrEqual(after);
    });

    it('should not change processedAt if already processed', () => {
      const msg = InboxMessage.receive(baseProps);
      const first = new Date('2024-01-01T00:01:00Z');
      msg.markProcessed(first);
      const second = new Date('2024-01-01T00:02:00Z');
      msg.markProcessed(second);
      expect(msg.processedAt).toEqual(first);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct unprocessed message from state', () => {
      const msg = InboxMessage.receive(baseProps);
      const state = msg.toJSON();
      const rehydrated = InboxMessage.rehydrate(state);
      expect(rehydrated.messageId).toBe(msg.messageId);
      expect(rehydrated.consumerName).toBe(msg.consumerName);
      expect(rehydrated.payloadHash).toBe(msg.payloadHash);
      expect(rehydrated.isProcessed()).toBe(false);
    });

    it('should reconstruct processed message from state', () => {
      const msg = InboxMessage.receive(baseProps);
      msg.markProcessed(new Date('2024-01-01T00:01:00Z'));
      const state = msg.toJSON();
      const rehydrated = InboxMessage.rehydrate(state);
      expect(rehydrated.isProcessed()).toBe(true);
      expect(rehydrated.processedAt).toEqual(new Date('2024-01-01T00:01:00Z'));
    });
  });

  describe('toJSON()', () => {
    it('should serialize unprocessed message', () => {
      const msg = InboxMessage.receive(baseProps);
      const json = msg.toJSON();
      expect(json).toEqual({
        messageId: 'msg-001',
        consumerName: 'wager-consumer',
        payloadHash: 'abc123',
        receivedAt: new Date('2024-01-01T00:00:00Z'),
        processedAt: undefined,
      });
    });

    it('should serialize processed message', () => {
      const msg = InboxMessage.receive(baseProps);
      msg.markProcessed(new Date('2024-01-01T00:01:00Z'));
      const json = msg.toJSON();
      expect(json.processedAt).toEqual(new Date('2024-01-01T00:01:00Z'));
    });
  });

  describe('deduplication key', () => {
    it.each([
      ['msg-001', 'wager-consumer', 'msg-001', 'wager-consumer', true],
      ['msg-001', 'wager-consumer', 'msg-001', 'other-consumer', false],
      ['msg-001', 'wager-consumer', 'msg-002', 'wager-consumer', false],
      ['msg-001', 'wager-consumer', 'msg-002', 'other-consumer', false],
    ])(
      '(%s, %s) matches (%s, %s) = %s',
      (id1, consumer1, id2, consumer2, expected) => {
        const msg1 = InboxMessage.receive({
          messageId: id1,
          consumerName: consumer1,
          payloadHash: 'hash1',
        });
        const msg2 = InboxMessage.receive({
          messageId: id2,
          consumerName: consumer2,
          payloadHash: 'hash2',
        });
        const match = msg1.messageId === msg2.messageId && msg1.consumerName === msg2.consumerName;
        expect(match).toBe(expected);
      },
    );
  });
});
