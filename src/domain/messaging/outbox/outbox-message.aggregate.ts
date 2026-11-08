import {
  OutboxMessageState,
  EnqueueOutboxProps,
  BackoffConfig,
  DEFAULT_BACKOFF_CONFIG,
} from './outbox-types';

export class OutboxMessage {
  public readonly id: string;
  public readonly aggregateId: string;
  public readonly eventType: string;
  public readonly payload: Readonly<Record<string, unknown>>;
  public readonly occurredAt: Date;
  private _attempts: number;
  private _nextAttemptAt: Date;
  private _publishedAt?: Date;

  private constructor(props: {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
    occurredAt: Date;
    attempts: number;
    nextAttemptAt: Date;
    publishedAt?: Date;
  }) {
    this.id = props.id;
    this.aggregateId = props.aggregateId;
    this.eventType = props.eventType;
    this.payload = Object.freeze({ ...props.payload });
    this.occurredAt = props.occurredAt;
    this._attempts = props.attempts;
    this._nextAttemptAt = props.nextAttemptAt;
    this._publishedAt = props.publishedAt;
  }

  static enqueue(props: EnqueueOutboxProps): OutboxMessage {
    const now = props.occurredAt ?? new Date();
    return new OutboxMessage({
      id: props.id,
      aggregateId: props.aggregateId,
      eventType: props.eventType,
      payload: props.payload,
      occurredAt: now,
      attempts: 0,
      nextAttemptAt: now,
    });
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage({
      id: state.id,
      aggregateId: state.aggregateId,
      eventType: state.eventType,
      payload: state.payload,
      occurredAt: state.occurredAt,
      attempts: state.attempts,
      nextAttemptAt: state.nextAttemptAt,
      publishedAt: state.publishedAt,
    });
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    return this._nextAttemptAt <= now;
  }

  isExhausted(config: BackoffConfig = DEFAULT_BACKOFF_CONFIG): boolean {
    return this._attempts >= config.maxAttempts;
  }

  markPublished(at?: Date): void {
    this._publishedAt = at ?? new Date();
  }

  scheduleRetry(
    now: Date = new Date(),
    config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
  ): void {
    this._attempts++;
    const delay = Math.min(
      config.baseDelayMs * Math.pow(2, this._attempts - 1),
      config.maxDelayMs,
    );
    this._nextAttemptAt = new Date(now.getTime() + delay);
  }

  toJSON(): OutboxMessageState {
    return {
      id: this.id,
      aggregateId: this.aggregateId,
      eventType: this.eventType,
      payload: this.payload,
      occurredAt: this.occurredAt,
      attempts: this._attempts,
      nextAttemptAt: this._nextAttemptAt,
      publishedAt: this._publishedAt,
    };
  }
}
