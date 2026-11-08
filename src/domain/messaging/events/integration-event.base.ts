export abstract class IntegrationEvent<T> {
  public abstract readonly eventType: string;
  public abstract readonly version: number;

  constructor(
    public readonly eventId: string,
    public readonly aggregateId: string,
    public readonly correlationId: string,
    public readonly causationId: string | undefined,
    public readonly occurredAt: Date,
    public readonly data: Readonly<T>,
  ) {}

  toJSON(): {
    eventId: string;
    eventType: string;
    aggregateId: string;
    correlationId: string;
    causationId: string | undefined;
    occurredAt: string;
    version: number;
    data: T;
  } {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: this.data,
    };
  }
}
