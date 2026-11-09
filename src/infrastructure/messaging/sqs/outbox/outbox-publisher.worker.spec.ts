import {describe, expect, it, mock} from 'bun:test';
import {OutboxPublisherWorker} from './outbox-publisher.worker';
import {OutboxMessageEntity} from '@infrastructure/persistence/outbox-message.entity';

describe('OutboxPublisherWorker', () => {
  const buildMockEm = () => {
    const em = {
      find: mock(() => Promise.resolve([])),
      persist: mock(() => {}),
      flush: mock(() => Promise.resolve()),
    };
    return em;
  };

  const buildMockOrm = (em: any) => ({
    em: { fork: () => em },
  });

  describe('publish', () => {
    it('should do nothing when no pending messages', async () => {
      const em = buildMockEm();
      const orm = buildMockOrm(em);
      const worker = new OutboxPublisherWorker(orm as any);
      await worker.publish();
      expect(em.find).toHaveBeenCalledTimes(1);
      expect(em.persist).not.toHaveBeenCalled();
    });

    it('should publish pending messages', async () => {
      const message = {
        id: 'outbox-1',
        type: 'WagerTransactionProcessed',
        payload: JSON.stringify({ transactionId: 'tx-1' }),
        attempts: 0,
      };
      const em = buildMockEm();
      em.find.mockResolvedValue([message]);
      const orm = buildMockOrm(em);
      const worker = new OutboxPublisherWorker(orm as any);
      await worker.publish();

      expect(em.find).toHaveBeenCalledTimes(1);
      expect(em.persist).toHaveBeenCalledWith(message);
      expect(em.flush).toHaveBeenCalledTimes(1);
    });

    it('should retry with backoff on publish failure', async () => {
      const message = {
        id: 'outbox-1',
        type: 'WagerTransactionProcessed',
        payload: JSON.stringify({ transactionId: 'tx-1' }),
        attempts: 0,
      };
      const em = buildMockEm();
      em.find.mockResolvedValue([message]);
      // First flush fails (publish), second flush succeeds (retry save)
      em.flush.mockRejectedValueOnce(new Error('publish failed')).mockResolvedValueOnce(undefined);
      const orm = buildMockOrm(em);
      const worker = new OutboxPublisherWorker(orm as any);
      await worker.publish();

      // persist called twice (once for publish, once for retry)
      expect(em.persist).toHaveBeenCalledTimes(2);
      expect(message.attempts).toBe(1);
      expect(message.nextAttemptAt instanceof Date).toBe(true);
    });

    it('should cap backoff at max delay', async () => {
      const message = {
        id: 'outbox-1',
        type: 'WagerTransactionProcessed',
        payload: JSON.stringify({ transactionId: 'tx-1' }),
        attempts: 10,
      };
      const em = buildMockEm();
      em.find.mockResolvedValue([message]);
      em.flush.mockRejectedValueOnce(new Error('publish failed')).mockResolvedValueOnce(undefined);
      const orm = buildMockOrm(em);
      const worker = new OutboxPublisherWorker(orm as any);
      await worker.publish();

      expect(message.attempts).toBe(11);
      const delay = message.nextAttemptAt.getTime() - Date.now();
      expect(delay).toBeLessThanOrEqual(60_000); // max 60s
    });
  });
});
