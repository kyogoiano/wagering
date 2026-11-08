# PLAN-000.1: Inbox & Outbox Messaging

## Visão Geral

Plano de implementação do sistema de mensageria com inbox persistente, outbox transacional, consumidor SQS e worker de publicação.

## Módulos NestJS

```
src/
├── messaging/
│   ├── inbox/
│   │   ├── inbox-message.entity.ts
│   │   ├── inbox-message.aggregate.ts
│   │   ├── inbox.repository.ts
│   │   └── inbox.service.ts
│   ├── outbox/
│   │   ├── outbox-message.entity.ts
│   │   ├── outbox-message.aggregate.ts
│   │   ├── outbox.repository.ts
│   │   ├── outbox.service.ts
│   │   └── outbox-publisher.worker.ts
│   ├── sqs/
│   │   ├── sqs.consumer.ts
│   │   ├── sqs.module.ts
│   │   └── sqs.options.ts
│   └── events/
│       ├── integration-event.base.ts
│       ├── wager-transaction-processed.event.ts
│       ├── wager-transaction-rejected.event.ts
│       ├── wallet-balance-changed.event.ts
│       └── wager-transaction-pending-reference.event.ts
```

## Entities MikroORM

### InboxMessage Entity

```typescript
@Entity()
export class InboxMessageEntity {
  @PrimaryKey({ type: 'string', length: 255 })
  messageId: string;

  @PrimaryKey({ type: 'string', length: 255 })
  consumerName: string;

  @Property({ type: 'string', length: 64 })
  payloadHash: string;

  @Property({ type: 'datetime' })
  receivedAt: Date;

  @Property({ type: 'datetime', nullable: true })
  processedAt?: Date;
}
```

### OutboxMessage Entity

```typescript
@Entity()
export class OutboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string;

  @Property({ type: 'uuid' })
  aggregateId: string;

  @Property({ type: 'string', length: 100 })
  eventType: string;

  @Property({ type: 'json' })
  payload: Record<string, unknown>;

  @Property({ type: 'datetime' })
  occurredAt: Date;

  @Property({ type: 'int' })
  attempts: number;

  @Property({ type: 'datetime' })
  nextAttemptAt: Date;

  @Property({ type: 'datetime', nullable: true })
  publishedAt?: Date;
}
```

## Migrations DDL

```sql
-- 004_create_inbox_messages.sql
CREATE TABLE inbox_messages (
    message_id    VARCHAR(255) NOT NULL,
    consumer_name VARCHAR(255) NOT NULL,
    payload_hash  VARCHAR(64) NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at  TIMESTAMPTZ,
    PRIMARY KEY (message_id, consumer_name)
);

-- 005_create_outbox_messages.sql
CREATE TABLE outbox_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id    UUID NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    CONSTRAINT chk_outbox_pending CHECK (
        (published_at IS NULL AND attempts < 5) OR
        (published_at IS NOT NULL)
    )
);

CREATE INDEX idx_outbox_pending ON outbox_messages(next_attempt_at) WHERE published_at IS NULL;
```

## Services

| Service | Responsabilidade |
|---------|-----------------|
| `InboxService` | Verificar e registrar mensagens no inbox |
| `OutboxService` | Inserir e consultar eventos na outbox |
| `OutboxPublisherWorker` | Publicar eventos pendentes com retry |
| `SqsConsumer` | Consumir mensagens da fila SQS |

## Ordem de Implementação (TDD)

1. `InboxMessage` — aggregate com testes
2. `OutboxMessage` — aggregate com testes
3. `IntegrationEvent` — envelope abstrato
4. Eventos concretos (4 tipos)
5. Inbox entity e repository
6. Outbox entity e repository
7. Migrations DDL
8. `SqsConsumer` — com deduplicação via inbox
9. `OutboxPublisherWorker` — com SKIP LOCKED
10. DLQ handler
