import { describe, expect, it } from 'bun:test';
import { PostgresHealthIndicator } from './postgres.health.indicator';
import { SqsHealthIndicator } from './sqs.health.indicator';

describe('Health Indicators', () => {
  describe('PostgresHealthIndicator', () => {
    it('should return up when connection works', async () => {
      const mockEm = {
        getConnection: () => ({
          execute: async () => ({ rows: [] }),
        }),
      };
      const indicator = new PostgresHealthIndicator(mockEm as any);
      const result = await indicator.isHealthy();
      expect(result.status).toBe('up');
      expect(result.detail).toEqual({ postgresql: 'ok' });
    });

    it('should return down when connection fails', async () => {
      const mockEm = {
        getConnection: () => ({
          execute: async () => {
            throw new Error('Connection refused');
          },
        }),
      };
      const indicator = new PostgresHealthIndicator(mockEm as any);
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ postgresql: 'error' });
      expect(result.error).toContain('Connection refused');
    });

    it('should return down when EntityManager is not configured', async () => {
      const indicator = new PostgresHealthIndicator(undefined);
      const result = await indicator.isHealthy();
      expect(result.status).toBe('down');
      expect(result.detail).toEqual({ postgresql: 'not_configured' });
      expect(result.error).toContain('EntityManager not configured');
    });
  });

  describe('SqsHealthIndicator', () => {
    it('should return down when SQS client is not available', async () => {
      const mockConfigService = {
        get: (key: string, fallback?: string) => fallback || null,
      };
      const indicator = new SqsHealthIndicator(undefined, mockConfigService as any);
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
      const mockConfigService = {
        get: (key: string, fallback?: string) => fallback || 'test.fifo',
      };
      const indicator = new SqsHealthIndicator(
        mockSqsClient as any,
        mockConfigService as any,
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
      const mockConfigService = {
        get: (key: string, fallback?: string) => fallback || 'test.fifo',
      };
      const indicator = new SqsHealthIndicator(
        mockSqsClient as any,
        mockConfigService as any,
      );
      const result = await indicator.isHealthy();
      expect(result.status).toBe('up');
      expect(result.detail).toEqual({ sqs: 'ok' });
    });
  });
});
