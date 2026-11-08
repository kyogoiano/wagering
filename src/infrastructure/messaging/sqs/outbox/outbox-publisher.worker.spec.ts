import { describe, expect, it, mock } from 'bun:test';
import { OutboxPublisherWorker } from './outbox-publisher.worker';
import { OutboxMessageRepository } from '@infrastructure/persistence/outbox-message.repository';

describe('OutboxPublisherWorker', () => {
  const buildMockRepo = () => {
    const repo = {
      findPendingDue: mock(() => Promise.resolve([])),
      markAsPublished: mock(() => Promise.resolve()),
      retryLater: mock(() => Promise.resolve()),
    } as unknown as OutboxMessageRepository;
    return repo;
  };

  describe('publish', () => {
    it('should do nothing when no pending messages', async () => {
      const repo = buildMockRepo();
      const worker = new OutboxPublisherWorker(repo);
      await worker.publish();
      expect(repo.findPendingDue).toHaveBeenCalledTimes(1);
      expect(repo.markAsPublished).not.toHaveBeenCalled();
    });

    it('should publish pending messages', async () => {
      const repo = buildMockRepo();
      const message = {
        id: 'outbox-1',
        type: 'WagerTransactionProcessed',
        payload: JSON.stringify({ transactionId: 'tx-1' }),
        attempts: 0,
      };
      repo.findPendingDue.mockResolvedValue([message]);

      const worker = new OutboxPublisherWorker(repo);
      await worker.publish();

      expect(repo.findPendingDue).toHaveBeenCalledTimes(1);
      expect(repo.markAsPublished).toHaveBeenCalledWith(message);
    });

    it('should retry with backoff on publish failure', async () => {
      const repo = buildMockRepo();
      const message = {
        id: 'outbox-1',
        type: 'WagerTransactionProcessed',
        payload: 'invalid json',
        attempts: 0,
      };
      repo.findPendingDue.mockResolvedValue([message]);

      const worker = new OutboxPublisherWorker(repo);
      await worker.publish();

      expect(repo.retryLater).toHaveBeenCalled();
      const retryCall = (repo.retryLater as any).mock.calls[0];
      expect(retryCall[1]).toBe(1); // attempts incremented
      expect(retryCall[2] instanceof Date).toBe(true); // nextAttemptAt is a Date
    });

    it('should cap backoff at max delay', async () => {
      const repo = buildMockRepo();
      const message = {
        id: 'outbox-1',
        type: 'WagerTransactionProcessed',
        payload: 'invalid json',
        attempts: 10, // High attempt count
      };
      repo.findPendingDue.mockResolvedValue([message]);

      const worker = new OutboxPublisherWorker(repo);
      await worker.publish();

      const retryCall = (repo.retryLater as any).mock.calls[0];
      expect(retryCall[1]).toBe(11); // attempts incremented
      const delay = retryCall[2].getTime() - Date.now();
      expect(delay).toBeLessThanOrEqual(60_000); // max 60s
    });
  });
});
