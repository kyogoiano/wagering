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
