import { describe, expect, it, beforeEach } from 'bun:test';
import { PrometheusMetricsService } from './prometheus-metrics.service';

describe('PrometheusMetricsService', () => {
  let service: PrometheusMetricsService;

  beforeEach(() => {
    service = new PrometheusMetricsService();
  });

  describe('Business metrics', () => {
    it('should increment transaction counter', async () => {
      service.incrementTransaction('processed', 'WAGER', 'provider-a');
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_transactions_total');
      expect(output).toContain('status="processed"');
      expect(output).toContain('kind="WAGER"');
      expect(output).toContain('provider_id="provider-a"');
    });

    it('should increment duplicate counter', async () => {
      service.incrementDuplicate('idempotency_key');
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_duplicates_detected_total');
      expect(output).toContain('type="idempotency_key"');
    });

    it('should increment retry counter', async () => {
      service.incrementRetry('inbox');
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_retries_total');
      expect(output).toContain('type="inbox"');
    });

    it('should increment DLQ counter', async () => {
      service.incrementDlq();
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_dlq_total');
    });

    it('should increment balance change counter', async () => {
      service.incrementBalanceChange('debit');
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_balance_changed_total');
      expect(output).toContain('direction="debit"');
    });

    it('should increment reconciliation discrepancy counter', async () => {
      service.incrementReconciliationDiscrepancy();
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_reconciliation_discrepancies_total');
    });
  });

  describe('Infrastructure metrics', () => {
    it('should increment lock conflict counter', async () => {
      service.incrementLockConflict();
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_lock_conflicts_total');
    });

    it('should set outbox lag gauge', async () => {
      service.setOutboxLag(5);
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_outbox_lag');
      expect(output).toContain('5');
    });

    it('should observe processing latency', async () => {
      service.observeProcessingLatency('process_transaction', 0.25);
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_processing_latency_seconds');
      expect(output).toContain('operation="process_transaction"');
    });

    it('should start and stop processing timer', async () => {
      const finish = service.startProcessingTimer('test_operation');
      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      finish();
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_processing_latency_seconds');
      expect(output).toContain('operation="test_operation"');
    });

    it('should increment HTTP request counter', async () => {
      service.incrementHttpRequest('GET', '/wallets/{id}', '200');
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_http_requests_total');
      expect(output).toContain('method="GET"');
      expect(output).toContain('endpoint="/wallets/{id}"');
      expect(output).toContain('status="200"');
    });

    it('should increment SQS message received counter', async () => {
      service.incrementSqsMessageReceived();
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_sqs_messages_received_total');
    });

    it('should increment SQS message acked counter', async () => {
      service.incrementSqsMessageAcked();
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_sqs_messages_acked_total');
    });
  });

  describe('Metrics output', () => {
    it('should return Prometheus text format', async () => {
      service.incrementTransaction('processed', 'WAGER', 'provider-a');
      const output = await service.getMetricsAsString();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should expose all registered metrics', async () => {
      const output = await service.getMetricsAsString();
      expect(output).toContain('wager_transactions_total');
      expect(output).toContain('wager_duplicates_detected_total');
      expect(output).toContain('wager_retries_total');
      expect(output).toContain('wager_dlq_total');
      expect(output).toContain('wager_balance_changed_total');
      expect(output).toContain('wager_reconciliation_discrepancies_total');
      expect(output).toContain('wager_lock_conflicts_total');
      expect(output).toContain('wager_outbox_lag');
      expect(output).toContain('wager_processing_latency_seconds');
      expect(output).toContain('wager_http_requests_total');
      expect(output).toContain('wager_sqs_messages_received_total');
      expect(output).toContain('wager_sqs_messages_acked_total');
    });

    it('should provide registry access', () => {
      const registry = service.getRegistry();
      expect(registry).toBeDefined();
    });
  });
});
