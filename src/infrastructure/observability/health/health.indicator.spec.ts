import { describe, expect, it } from 'bun:test';
import { PostgresHealthIndicator } from './postgres.health.indicator';
import { SqsHealthIndicator } from './sqs.health.indicator';

describe('Health Indicators', () => {
  describe('PostgresHealthIndicator', () => {
    it('should return up when ORM connection works', async () => {
      const mockOrm = {
        getConnection: () => ({
          execute: async () => ({ rows: [] }),
        }),
      };
      const indicator = new PostgresHealthIndicator(mockOrm as any);
      const result = await indicator.isHealthy();
      expect(result.status).toBe('up');
      expect(result.detail).toEqual({ postgresql: 'ok' });
    });

    it('should return down when connection fails', async () => {
      const mockOrm = {
        getConnection: () => ({
          execute: async () => {
            throw new Error('Connection refused');
          },
        }),
      };
      const indicator = new PostgresHealthIndicator(mockOrm as any);
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ postgresql: 'error' });
      expect(result.error).toContain('Connection refused');
    });

    it('should return down when ORM is not configured', async () => {
      const indicator = new PostgresHealthIndicator(undefined);
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ postgresql: 'not_configured' });
      expect(result.error).toContain('MikroORM not configured');
    });
  });

  describe('SqsHealthIndicator', () => {
    it('should return down when SQS client is not available', async () => {
      const indicator = new SqsHealthIndicator();
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ sqs: 'not_configured' });
      expect(result.error).toContain('SQS client not available');
    });

    it('should return down when SQS connection fails', async () => {
      const mockSqsClient = {
        send: async () => {
          throw new Error('Connection refused');
        },
      };
      const indicator = new SqsHealthIndicator(
        mockSqsClient as any,
        { queueName: 'test.fifo' },
      );
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ sqs: 'error' });
      expect(result.error).toContain('Connection refused');
    });

    it('should return up when SQS connection works', async () => {
      const mockSqsClient = {
        send: async () => ({
          QueueUrl: 'http://localhost:4566/000000000000/test.fifo',
        }),
      };
      const indicator = new SqsHealthIndicator(
        mockSqsClient as any,
        { queueName: 'test.fifo' },
      );
      const result = await indicator.isHealthy();
      expect(result.status).toBe('up');
      expect(result.detail).toEqual({ sqs: 'ok' });
    });
  });
});
