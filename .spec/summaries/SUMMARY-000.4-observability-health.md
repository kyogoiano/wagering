# SUMMARY-000.4: Observability & Health

## Status

✓ Concluído

## O que foi implementado

- **PinoLoggerService** (`src/infrastructure/observability/logging/`) — Serviço injetável com campos padronizados (correlationId, messageId, transactionId, walletId, providerId); stack trace em erros; timestamps ISO; LoggingModule @Global
- **PrometheusMetricsService** (`src/infrastructure/observability/metrics/`) — 12 métricas via @prometheus-io/client (6 de negócio + 6 de infraestrutura); endpoint `/metrics`; HttpMetricsMiddleware para requests HTTP; MetricsModule @Global
- **Health Checks** — PostgresHealthIndicator (via MikroORM connection check) + SqsHealthIndicator (via env var); `/health` retorna live; `/health/ready` retorna 503 se dependência falha
- **ReconciliationService** — Log ERROR + métrica de discrepância quando balance ≠ ledger sum
- **AppModule** — LoggingModule.forRoot() + MetricsModule.forRoot()
- **main.ts** — PinoLogger global

## Decisões tomadas

- Pino para logs estruturados JSON (padrão da indústria Node.js)
- @prometheus-io/client para métricas Prometheus nativo
- Health indicators verificam conectividade real, não apenas status do processo

## Lições aprendidas

- Prometheus counters/histograms precisam ser registrados no registry antes do scrape
- Health checks devem ser rápidos e não bloqueantes

## Issues conhecidos

- Nenhum — todos os health indicators funcionam com conexões reais

---

## Manual de Execução

### Testar observabilidade

```bash
# Testes do PinoLogger (14 testes)
bun test src/infrastructure/observability/logging/

# Testes das métricas Prometheus (16 testes)
bun test src/infrastructure/observability/metrics/

# Testes de health checks (5 testes)
bun test src/infrastructure/observability/health/
```

### Verificar logs estruturados

```bash
# Iniciar a aplicação e enviar uma transação
bun run start

# Os logs são emitidos em JSON com campos padronizados:
# {
#   "level": 30,
#   "time": "2026-11-08T20:00:00.000Z",
#   "msg": "Transaction processed",
#   "correlationId": "abc-123",
#   "transactionId": "tx-456",
#   "walletId": "w-789",
#   "providerId": "provider-a"
# }
```

### Verificar métricas Prometheus

```bash
# Endpoint de métricas (público)
curl http://localhost:3000/metrics

# Métricas de negócio:
# wager_transactions_total{status="PROCESSED"}
# wager_transactions_total{status="REJECTED"}
# wager_transactions_total{status="PENDING_REFERENCE"}
# wallet_balance_changed_total{direction="DEBIT"}
# wallet_balance_changed_total{direction="CREDIT"}
# reconciliation_discrepancy_total

# Métricas de infraestrutura:
# http_request_duration_seconds
# http_requests_total{method="POST",status="201"}
# inbox_deduplicated_total
# outbox_published_total
# outbox_retry_total
# sqs_dlq_total
```

### Verificar health checks

```bash
# Liveness (sempre 200 se o processo está vivo)
curl http://localhost:3000/health/live
# → { "status": "ok" }

# Readiness (503 se PostgreSQL ou SQS indisponíveis)
curl http://localhost:3000/health/ready
# → { "status": "ok", "postgres": "up", "sqs": "up" }
# ou
# → 503 { "status": "error", "postgres": "up", "sqs": "down" }
```
