import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';

export type TransactionStatusLabel = 'processed' | 'rejected' | 'failed' | 'pending_reference';
export type DuplicateLabel = 'idempotency_key' | 'payload_hash';
export type RetryLabel = 'inbox' | 'outbox';
export type BalanceDirectionLabel = 'debit' | 'credit';
export type HttpStatusLabel = string;
export type HttpMethodLabel = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

@Injectable()
export class PrometheusMetricsService {
  protected readonly registry: Registry;

  // --- Business Metrics ---

  protected readonly wagerTransactionsTotal: Counter<'status' | 'kind' | 'provider_id'>;
  protected readonly wagerDuplicatesDetectedTotal: Counter<'type'>;
  protected readonly wagerRetriesTotal: Counter<'type'>;
  protected readonly wagerDlqTotal: Counter;
  protected readonly wagerBalanceChangedTotal: Counter<'direction'>;
  protected readonly wagerReconciliationDiscrepanciesTotal: Counter;

  // --- Infrastructure Metrics ---

  protected readonly wagerLockConflictsTotal: Counter;
  protected readonly wagerOutboxLag: Gauge;
  protected readonly wagerProcessingLatencySeconds: Histogram<'operation'>;
  protected readonly wagerHttpRequestsTotal: Counter<'method' | 'endpoint' | 'status'>;
  protected readonly wagerSqsMessagesReceivedTotal: Counter;
  protected readonly wagerSqsMessagesAcksTotal: Counter;

  constructor() {
    this.registry = new Registry();

    // Business metrics
    this.wagerTransactionsTotal = new Counter({
      name: 'wager_transactions_total',
      help: 'Total wager transactions by status',
      labelNames: ['status', 'kind', 'provider_id'],
      registers: [this.registry],
    });

    this.wagerDuplicatesDetectedTotal = new Counter({
      name: 'wager_duplicates_detected_total',
      help: 'Duplicates detected by idempotency',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.wagerRetriesTotal = new Counter({
      name: 'wager_retries_total',
      help: 'Message retries by type',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.wagerDlqTotal = new Counter({
      name: 'wager_dlq_total',
      help: 'Messages sent to DLQ',
      registers: [this.registry],
    });

    this.wagerBalanceChangedTotal = new Counter({
      name: 'wager_balance_changed_total',
      help: 'Balance changes by direction',
      labelNames: ['direction'],
      registers: [this.registry],
    });

    this.wagerReconciliationDiscrepanciesTotal = new Counter({
      name: 'wager_reconciliation_discrepancies_total',
      help: 'Reconciliation discrepancies detected',
      registers: [this.registry],
    });

    // Infrastructure metrics
    this.wagerLockConflictsTotal = new Counter({
      name: 'wager_lock_conflicts_total',
      help: 'Lock conflicts detected',
      registers: [this.registry],
    });

    this.wagerOutboxLag = new Gauge({
      name: 'wager_outbox_lag',
      help: 'Number of pending events in outbox',
      registers: [this.registry],
    });

    this.wagerProcessingLatencySeconds = new Histogram({
      name: 'wager_processing_latency_seconds',
      help: 'Processing latency by operation',
      labelNames: ['operation'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    this.wagerHttpRequestsTotal = new Counter({
      name: 'wager_http_requests_total',
      help: 'HTTP requests by method, endpoint and status',
      labelNames: ['method', 'endpoint', 'status'],
      registers: [this.registry],
    });

    this.wagerSqsMessagesReceivedTotal = new Counter({
      name: 'wager_sqs_messages_received_total',
      help: 'SQS messages received',
      registers: [this.registry],
    });

    this.wagerSqsMessagesAcksTotal = new Counter({
      name: 'wager_sqs_messages_acked_total',
      help: 'SQS messages acknowledged',
      registers: [this.registry],
    });
  }

  // --- Business Metric Methods ---

  incrementTransaction(status: TransactionStatusLabel, kind: string, providerId: string) {
    this.wagerTransactionsTotal.inc({ status, kind, provider_id: providerId });
  }

  incrementDuplicate(type: DuplicateLabel) {
    this.wagerDuplicatesDetectedTotal.inc({ type });
  }

  incrementRetry(type: RetryLabel) {
    this.wagerRetriesTotal.inc({ type });
  }

  incrementDlq() {
    this.wagerDlqTotal.inc();
  }

  incrementBalanceChange(direction: BalanceDirectionLabel) {
    this.wagerBalanceChangedTotal.inc({ direction });
  }

  incrementReconciliationDiscrepancy() {
    this.wagerReconciliationDiscrepanciesTotal.inc();
  }

  // --- Infrastructure Metric Methods ---

  incrementLockConflict() {
    this.wagerLockConflictsTotal.inc();
  }

  setOutboxLag(count: number) {
    this.wagerOutboxLag.set(count);
  }

  observeProcessingLatency(operation: string, seconds: number) {
    this.wagerProcessingLatencySeconds.observe({ operation }, seconds);
  }

  /** Returns a timer function that observes latency when called. */
  startProcessingTimer(operation: string): () => void {
    return this.wagerProcessingLatencySeconds.startTimer({ operation });
  }

  incrementHttpRequest(method: HttpMethodLabel, endpoint: string, status: HttpStatusLabel) {
    this.wagerHttpRequestsTotal.inc({ method, endpoint, status });
  }

  incrementSqsMessageReceived() {
    this.wagerSqsMessagesReceivedTotal.inc();
  }

  incrementSqsMessageAcked() {
    this.wagerSqsMessagesAcksTotal.inc();
  }

  // --- Registry Access ---

  async getMetricsAsString(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
