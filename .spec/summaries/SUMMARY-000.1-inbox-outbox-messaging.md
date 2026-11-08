# SUMMARY-000.1: Inbox/Outbox Messaging

## Status

✓ Concluído

## O que foi implementado

- **InboxMessage** (`src/domain/messaging/inbox/`) — Aggregate para deduplicação de mensagens SQS; payload hash; campos messageId, consumerName, receivedAt, processedAt
- **OutboxMessage** (`src/domain/messaging/outbox/`) — Aggregate para publicação confiável; backoff exponencial; campos aggregateId, eventType, payload (JSON), attempts, nextAttemptAt, publishedAt
- **IntegrationEvent** (`src/domain/messaging/events/`) — Classe base com eventType, payload, occurredAt; 4 eventos concretos: WagerTransactionProcessed, WagerTransactionRejected, WagerTransactionPendingReference, WalletBalanceChanged
- **MikroORM Entities** — InboxMessageEntity, OutboxMessageEntity com constraints
- **Migration SQL** — 004_create_inbox_outbox.sql com tabelas e indexes

## Decisões tomadas

- Inbox usa composite key (messageId, consumerName) para deduplicação por consumidor
- Outbox armazena payload como JSONB para flexibilidade
- Eventos herdam de IntegrationEvent base com discriminação por eventType

## Lições aprendidas

- O outbox pattern garante que eventos são publicados dentro da mesma transação que a operação de negócio
- Backoff exponencial no outbox previne sobrecarga do provedor de mensagens

## Issues conhecidos

- SQS consumer e outbox publisher não implementados (apenas domain models)
- Sem testes de integração com MiniStack real

---

## Manual de Execução

### Testar inbox/outbox

```bash
# Todos os testes de messaging (51 testes)
bun test src/domain/messaging/

# Testes específicos
bun test src/domain/messaging/inbox/    # InboxMessage (deduplicação)
bun test src/domain/messaging/outbox/   # OutboxMessage (backoff)
bun test src/domain/messaging/events/   # IntegrationEvents (4 tipos)
```

### Verificar comportamento

Os testes verificam:
- **InboxMessage:** deduplicação por (messageId, consumerName), markProcessed, isProcessed
- **OutboxMessage:** backoff exponencial (baseDelay * 2^attempt), isDue, markPublished, scheduleRetry
- **IntegrationEvents:** 4 eventos concretos com eventType e version corretos

### Cenário: Simular deduplicação de mensagem

```typescript
// 1. Receber mensagem
const msg = InboxMessage.receive({ messageId: 'msg-1', consumerName: 'jungle-wager', payloadHash: 'abc123' });
msg.isProcessed() === false

// 2. Processar
msg.markProcessed(new Date());
msg.isProcessed() === true

// 3. Tentar receber duplicata — o banco rejeita por UNIQUE constraint
// (na prática, o consumer verifica antes de inserir)
```

### Cenário: Backoff exponencial do outbox

```typescript
const outbox = OutboxMessage.enqueue(event);
outbox.attempts === 0
outbox.isPending() === true

// Simular falha na publicação
const now = new Date();
outbox.scheduleRetry(now);
outbox.attempts === 1
outbox.nextAttemptAt > now  // backoff aplicado
```

### Testar migrations SQL

```bash
# Testar que as tabelas inbox/outbox foram criadas corretamente
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/integration/migrations.spec.ts
```
