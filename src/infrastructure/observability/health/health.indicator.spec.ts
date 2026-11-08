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
    it('should return down when SQS_QUEUE_URL is not configured', async () => {
      const original = process.env.SQS_QUEUE_URL;
      delete process.env.SQS_QUEUE_URL;
      const indicator = new SqsHealthIndicator();
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ sqs: 'not_configured' });
      expect(result.error).toContain('SQS_QUEUE_URL not configured');
      process.env.SQS_QUEUE_URL = original;
    });

    it('should return up when SQS_QUEUE_URL is configured', async () => {
      process.env.SQS_QUEUE_URL = 'http://localhost:9324/000000000000/test-queue';
      const indicator = new SqsHealthIndicator();
      const result = await indicator.isHealthy();
      expect(result.status).toBe('up');
      expect(result.detail).toEqual({ sqs: 'ok' });
    });
  });
});
