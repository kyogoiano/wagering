export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt: Date;
  publishedAt?: Date;
}

export interface EnqueueOutboxProps {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt?: Date;
}

export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  maxAttempts: 5,
};
