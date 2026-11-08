# SUMMARY-000.7: MiniStack SQS Infrastructure & Documentation

## Status
✅ Implementado

## Decisões Técnicas

1. **AWS SDK v3** — `@aws-sdk/client-sqs@3.1164.0` para comunicação com MiniStack
2. **SqsConfig interface** — Interface plain TypeScript ao invés de `ConfigType<typeof sqsConfig>` para evitar problemas de resolução de módulo com Bun
3. **SQS Consumer** — Polling loop com `setInterval` + `unref()` para não manter o processo vivo; graceful shutdown com timeout de 10s
4. **Outbox Publisher** — Worker `@Cron` a cada 15s com retry exponencial (1s base, 60s max)
5. **Filas FIFO** — Criadas automaticamente na inicialização do SqsModule com DLQ e redrivePolicy
6. **Deduplicação** — Inbox persistente por `(consumerName, messageId)` antes de processar
7. **Business vs Infrastructure errors** — Business errors ackam a mensagem; infrastructure errors deixam na fila para retry

## Testes

| Arquivo | Testes |
|---------|--------|
| `sqs-client.factory.spec.ts` | 3 (createSqsClient, ensureQueuesExist × 2) |
| `sqs-consumer.service.spec.ts` | 5 (process valid, dedup, business error, infra error, shutdown) |
| `outbox-publisher.worker.spec.ts` | 4 (no pending, publish, retry, max backoff) |
| `health.indicator.spec.ts` (Sqs) | 3 (not available, connection fails, connection works) |

**Total:** 15 novos testes unitários

## Arquivos Criados

- `src/infrastructure/messaging/sqs/sqs.config.ts` — Configuração via env vars
- `src/infrastructure/messaging/sqs/sqs-client.factory.ts` — Factory SQSClient + queue creation
- `src/infrastructure/messaging/sqs/sqs.module.ts` — Módulo NestJS com providers
- `src/infrastructure/messaging/sqs/consumer/sqs-consumer.service.ts` — Consumer com polling, dedup, ack
- `src/infrastructure/messaging/sqs/consumer/sqs-consumer.service.spec.ts` — 5 testes
- `src/infrastructure/messaging/sqs/outbox/outbox-publisher.worker.ts` — Worker @Cron
- `src/infrastructure/messaging/sqs/outbox/outbox-publisher.worker.spec.ts` — 4 testes
- `src/infrastructure/messaging/sqs/sqs-client.factory.spec.ts` — 3 testes
- `src/infrastructure/persistence/inbox-message.repository.ts` — Repositório do inbox
- `src/infrastructure/persistence/outbox-message.repository.ts` — Repositório do outbox

## Arquivos Modificados

- `docker-compose.yml` — MiniStack container adicionado
- `src/app/app.module.ts` — SqsModule.forRoot() importado
- `src/infrastructure/persistence/persistence.module.ts` — Inbox/Outbox repositories
- `src/infrastructure/observability/health/sqs.health.indicator.ts` — AWS SDK real
- `src/infrastructure/observability/health/health.indicator.spec.ts` — Testes atualizados
- `package.json` — `@aws-sdk/client-sqs` adicionado

## Lições Aprendidas

1. **ConfigType do NestJS 12** — Não é exportado diretamente em alguns contextos de módulo; usar interface plain TypeScript resolve
2. **Circular imports** — O SqsHealthIndicator não pode importar do SqsModule; usar token string direto
3. **Bun module resolution** — Interfaces exportadas em .ts files às vezes não são resolvidas em testes; definir inline quando necessário

## Issues Conhecidos

- O SqsConsumerService não inicia automaticamente se o MiniStack não estiver rodando (warning no console)
- O PendingReferenceWorker ainda não está registrado no AppModule — requer PostgreSQL rodando

## Manual de Execução

### Pré-requisitos
```bash
docker-compose up -d ministack
```

### Iniciar aplicação
```bash
bun run start
```

### Verificar filas criadas
```bash
# As filas são criadas automaticamente na inicialização
# Verificar logs: "SQS module: Queues created successfully"
```

### Enviar mensagem SQS
```bash
# Usando AWS CLI apontando para MiniStack
aws --endpoint-url http://localhost:4566 \
  --region us-east-1 \
  --profile test \
  sqs send-message \
  --queue-url http://localhost:4566/000000000000/wager-transactions.fifo \
  --message-body '{
    "messageId": "msg-123",
    "type": "WagerTransactionRequested",
    "occurredAt": "2026-01-01T00:00:00.000Z",
    "data": {
      "idempotencyKey": "provider-a:tx-123",
      "providerId": "provider-a",
      "externalTransactionId": "tx-123",
      "playerId": "player-1",
      "walletId": "wallet-1",
      "roundId": "round-1",
      "gameId": "game-1",
      "kind": "BET",
      "moneyAmount": "25.00",
      "moneyCurrency": "BRL"
    }
  }'
```

### Testes
```bash
bun test src/infrastructure/messaging/sqs/
```
