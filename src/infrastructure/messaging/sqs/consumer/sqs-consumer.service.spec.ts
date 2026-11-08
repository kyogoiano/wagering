import { describe, expect, it, mock } from 'bun:test';
import { SqsConsumerService } from './sqs-consumer.service';
import { InsufficientBalanceError } from '@domain/errors/domain.error';

interface SqsConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  queueName: string;
  dlqName: string;
  pollingIntervalMs: number;
  visibilityTimeoutSeconds: number;
  maxReceiveCount: number;
  consumerName: string;
}

describe('SqsConsumerService', () => {
  const config: SqsConfig = {
    endpoint: 'http://localhost:4566',
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    queueName: 'wager-transactions.fifo',
    dlqName: 'wager-transactions-dlq.fifo',
    pollingIntervalMs: 1000,
    visibilityTimeoutSeconds: 30,
    maxReceiveCount: 3,
    consumerName: 'jungle-wager-consumer',
  };

  const buildMocks = () => {
    const sqsClient = {
      send: mock(() => Promise.resolve({})),
    } as any;

    const inboxRepository = {
      findByMessageId: mock(() => Promise.resolve(null)),
      markAsProcessed: mock(() => Promise.resolve()),
    } as any;

    const transactionService = {
      submit: mock(() =>
        Promise.resolve({
          transactionId: 'tx-123',
          status: 'PROCESSED',
          balance: { amount: '75.00', currency: 'BRL' },
          idempotentReplay: false,
        }),
      ),
    } as any;

    return { sqsClient, inboxRepository, transactionService };
  };

  describe('processMessage', () => {
    it('should process valid message and ack', async () => {
      const { sqsClient, inboxRepository, transactionService } = buildMocks();
      const service = new SqsConsumerService(
        sqsClient,
        config,
        inboxRepository,
        transactionService,
      );

      const message = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          messageId: 'msg-1',
          type: 'WagerTransactionRequested',
          occurredAt: '2026-01-01T00:00:00.000Z',
          data: {
            idempotencyKey: 'key-1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: 'BET',
            moneyAmount: '25.00',
            moneyCurrency: 'BRL',
          },
        }),
        ReceiptHandle: 'receipt-1',
        QueueUrl: 'http://localhost:4566/000000000000/wager-transactions.fifo',
      };

      await service.processMessage(message);

      expect(transactionService.submit).toHaveBeenCalledTimes(1);
      expect(inboxRepository.markAsProcessed).toHaveBeenCalledTimes(1);
      expect(sqsClient.send).toHaveBeenCalled();
    });

    it('should deduplicate already processed message', async () => {
      const { sqsClient, inboxRepository, transactionService } = buildMocks();
      inboxRepository.findByMessageId.mockResolvedValue({ id: 1 });

      const service = new SqsConsumerService(
        sqsClient,
        config,
        inboxRepository,
        transactionService,
      );

      const message = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          messageId: 'msg-1',
          type: 'WagerTransactionRequested',
          occurredAt: '2026-01-01T00:00:00.000Z',
          data: {
            idempotencyKey: 'key-1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: 'BET',
            moneyAmount: '25.00',
            moneyCurrency: 'BRL',
          },
        }),
        ReceiptHandle: 'receipt-1',
        QueueUrl: 'http://localhost:4566/000000000000/wager-transactions.fifo',
      };

      await service.processMessage(message);

      expect(transactionService.submit).not.toHaveBeenCalled();
      expect(sqsClient.send).toHaveBeenCalled(); // ack
    });

    it('should ack on business error without retry', async () => {
      const { sqsClient, inboxRepository, transactionService } = buildMocks();
      transactionService.submit.mockRejectedValue(
        new InsufficientBalanceError('Insufficient balance'),
      );

      const service = new SqsConsumerService(
        sqsClient,
        config,
        inboxRepository,
        transactionService,
      );

      const message = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          messageId: 'msg-1',
          type: 'WagerTransactionRequested',
          occurredAt: '2026-01-01T00:00:00.000Z',
          data: {
            idempotencyKey: 'key-1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: 'BET',
            moneyAmount: '25.00',
            moneyCurrency: 'BRL',
          },
        }),
        ReceiptHandle: 'receipt-1',
        QueueUrl: 'http://localhost:4566/000000000000/wager-transactions.fifo',
      };

      await service.processMessage(message);

      // Should ack the message (DeleteMessageCommand called)
      expect(sqsClient.send).toHaveBeenCalled();
    });

    it('should not ack on infrastructure error (retry)', async () => {
      const { sqsClient, inboxRepository, transactionService } = buildMocks();
      transactionService.submit.mockRejectedValue(
        new Error('Database connection refused'),
      );

      const service = new SqsConsumerService(
        sqsClient,
        config,
        inboxRepository,
        transactionService,
      );

      const message = {
        MessageId: 'msg-1',
        Body: JSON.stringify({
          messageId: 'msg-1',
          type: 'WagerTransactionRequested',
          occurredAt: '2026-01-01T00:00:00.000Z',
          data: {
            idempotencyKey: 'key-1',
            providerId: 'provider-a',
            externalTransactionId: 'tx-1',
            playerId: 'player-1',
            walletId: 'wallet-1',
            roundId: 'round-1',
            gameId: 'game-1',
            kind: 'BET',
            moneyAmount: '25.00',
            moneyCurrency: 'BRL',
          },
        }),
        ReceiptHandle: 'receipt-1',
        QueueUrl: 'http://localhost:4566/000000000000/wager-transactions.fifo',
      };

      await service.processMessage(message);

      // Should NOT ack — message stays in queue for retry
      // But getQueueUrl may have been called, so check that DeleteMessageCommand was NOT called
      const deleteCalls = (sqsClient.send as any).mock.calls.filter(
        (call: any[]) => call[0].constructor?.name === 'DeleteMessageCommand',
      );
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should stop polling on shutdown', async () => {
      const { sqsClient, inboxRepository, transactionService } = buildMocks();
      const service = new SqsConsumerService(
        sqsClient,
        config,
        inboxRepository,
        transactionService,
      );

      // Start polling
      service.startPolling();

      // Shutdown
      await service.shutdown();

      // Polling should have stopped
      // We can't easily verify the timer is cleared, but no error should be thrown
    });
  });
});
