import { describe, expect, it, mock } from 'bun:test';
import { createSqsClient, ensureQueuesExist } from './sqs-client.factory';
import { SQSClient } from '@aws-sdk/client-sqs';

describe('sqs-client.factory', () => {
  const config = {
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

  describe('createSqsClient', () => {
    it('should create an SQSClient with correct config', () => {
      const client = createSqsClient(config);
      expect(client).toBeInstanceOf(SQSClient);
    });
  });

  describe('ensureQueuesExist', () => {
    it('should create DLQ and main queue when they do not exist', async () => {
      let callCount = 0;
      const mockSend = mock(() => {
        callCount++;
        // Call 1: GetQueueUrl for DLQ — fails
        // Call 2: CreateQueue for DLQ — succeeds
        // Call 3: GetQueueAttributes for DLQ ARN
        // Call 4: GetQueueUrl for main — fails
        // Call 5: CreateQueue for main — succeeds
        // Call 6: GetQueueAttributes for main ARN
        if (callCount === 1 || callCount === 4) {
          throw new Error('Queue does not exist');
        }
        if (callCount === 2) {
          return Promise.resolve({
            QueueUrl: 'http://localhost:4566/000000000000/wager-transactions-dlq.fifo',
          });
        }
        if (callCount === 3) {
          return Promise.resolve({
            Attributes: {
              QueueArn: 'arn:aws:sqs:us-east-1:000000000000:wager-transactions-dlq.fifo',
            },
          });
        }
        if (callCount === 5) {
          return Promise.resolve({
            QueueUrl: 'http://localhost:4566/000000000000/wager-transactions.fifo',
          });
        }
        if (callCount === 6) {
          return Promise.resolve({
            Attributes: {
              QueueArn: 'arn:aws:sqs:us-east-1:000000000000:wager-transactions.fifo',
            },
          });
        }
        return Promise.resolve({});
      });

      const client = { send: mockSend } as any as SQSClient;
      await ensureQueuesExist(client, config);

      expect(callCount).toBe(6);
      // Verify CreateQueueCommand was called twice (DLQ + main)
      const createQueueCalls = mockSend.mock.calls.filter(
        (call) => call[0].constructor.name === 'CreateQueueCommand',
      );
      expect(createQueueCalls.length).toBe(2);
    });

    it('should skip creation when queues already exist', async () => {
      let callCount = 0;
      const mockSend = mock(() => {
        callCount++;
        // Call 1: GetQueueUrl for DLQ — succeeds
        // Call 2: GetQueueAttributes for DLQ ARN
        // Call 3: GetQueueUrl for main — succeeds
        // Call 4: GetQueueAttributes for main ARN
        if (callCount === 1) {
          return Promise.resolve({
            QueueUrl: 'http://localhost:4566/000000000000/wager-transactions-dlq.fifo',
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            Attributes: {
              QueueArn: 'arn:aws:sqs:us-east-1:000000000000:wager-transactions-dlq.fifo',
            },
          });
        }
        if (callCount === 3) {
          return Promise.resolve({
            QueueUrl: 'http://localhost:4566/000000000000/wager-transactions.fifo',
          });
        }
        if (callCount === 4) {
          return Promise.resolve({
            Attributes: {
              QueueArn: 'arn:aws:sqs:us-east-1:000000000000:wager-transactions.fifo',
            },
          });
        }
        return Promise.resolve({});
      });

      const client = { send: mockSend } as any as SQSClient;
      await ensureQueuesExist(client, config);

      // GetQueueUrl + GetQueueAttributes for each queue = 4 calls
      expect(mockSend.mock.calls.length).toBe(4);
    });
  });
});
