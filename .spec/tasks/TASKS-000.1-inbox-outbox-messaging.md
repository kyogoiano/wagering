# TASKS-000.1: Inbox & Outbox Messaging

## Tarefas em Ordem TDD

### 1. InboxMessage

- [ ] **T053:** Escrever testes para `InboxMessage.receive()`
- [ ] **T054:** Implementar `InboxMessage` com factory `receive()` e `markProcessed()`
- [ ] **T055:** Implementar `rehydrate()`

### 2. OutboxMessage

- [ ] **T056:** Escrever testes para `OutboxMessage.enqueue()`
- [ ] **T057:** Implementar `OutboxMessage` com factory `enqueue()` e métodos de retry
- [ ] **T058:** Escrever testes para backoff exponencial
- [ ] **T059:** Implementar `scheduleRetry()` com backoff
- [ ] **T060:** Implementar `rehydrate()`

### 3. Integration Events

- [ ] **T061:** Criar `IntegrationEvent` abstract class
- [ ] **T062:** Implementar `WagerTransactionProcessed` event
- [ ] **T063:** Implementar `WagerTransactionRejected` event
- [ ] **T064:** Implementar `WalletBalanceChanged` event
- [ ] **T065:** Implementar `WagerTransactionPendingReference` event
- [ ] **T066:** Escrever testes para serialização dos eventos

### 4. Inbox Entity & Repository

- [ ] **T067:** Criar `InboxMessageEntity` com composite key
- [ ] **T068:** Implementar `InboxRepository` com método de deduplicação
- [ ] **T069:** Criar migration `004_create_inbox_messages.sql`

### 5. Outbox Entity & Repository

- [ ] **T070:** Criar `OutboxMessageEntity`
- [ ] **T071:** Implementar `OutboxRepository` com consulta de pendentes
- [ ] **T072:** Criar migration `005_create_outbox_messages.sql`
- [ ] **T073:** Criar índice partial para eventos pendentes

### 6. SQS Consumer

- [ ] **T074:** Configurar conexão com MiniStack/SQS
- [ ] **T075:** Implementar `SqsConsumer` com polling
- [ ] **T076:** Implementar deduplicação via inbox
- [ ] **T077:** Implementar ack após commit
- [ ] **T078:** Implementar envio para DLQ
- [ ] **T079:** Implementar graceful shutdown (SIGTERM)

### 7. Outbox Publisher

- [ ] **T080:** Implementar `OutboxPublisherWorker` com SKIP LOCKED
- [ ] **T081:** Implementar retry com backoff exponencial
- [ ] **T082:** Implementar marcação de publicado
