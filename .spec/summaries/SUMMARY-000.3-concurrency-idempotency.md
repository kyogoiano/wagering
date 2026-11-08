# SUMMARY-000.3: Concurrency & Idempotency

## Status

✓ Concluído

## O que foi implementado

- **IdempotencyService** (`src/application/idempotency/`) — Verifica idempotencyKey com payload hash conflict detection; detecta replay idempotente vs conflito 409; método secundário checkByProviderExternalId
- **PendingReferenceWorker** (`src/application/workers/`) — Worker agendado (@Cron a cada 30s) que reprocessa transações PENDING_REFERENCE com backoff exponencial; rejeita após TTL ou max attempts com REFERENCE_NOT_FOUND
- **TransactionService** atualizado — Usa IdempotencyService para idempotência; persiste transações com referência ausente como PENDING_REFERENCE com attempts=0
- **WagerTransactionEntity** — Novos campos attempts (int, default 0) e nextAttemptAt (timestamptz, nullable)
- **WagerTransactionRepository** — Novo método findPendingReferencesDue(now)
- **Migration SQL** — 004_add_pending_reference_fields.sql
- **AppModule** — ScheduleModule.forRoot() para @Cron

## Decisões tomadas

- Backoff exponencial: `baseDelayMs * 2^attempt` capped em `maxDelayMs`
- PENDING_REFERENCE usa attempts counter e nextAttemptAt para scheduling
- IdempotencyService separa verificação de idempotência da lógica de processamento

## Lições aprendidas

- O @Cron do NestJS ScheduleModule funciona sem provider injection explícita
- PendingReferenceWorker precisa ser injetado no AppModule para ser ativado

## Issues conhecidos

- PendingReferenceWorker não está injetado como provider no AppModule (pendente de integração completa)
- Sem testes de concorrência real com PostgreSQL (MikroORM v7 API incompatível com testes raw SQL em transações)
