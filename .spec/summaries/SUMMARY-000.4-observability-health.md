# SUMMARY-000.4: Observability & Health

## Status

✓ Implementado

## Arquivos Criados

### Logging (Pino)
- `src/infrastructure/observability/logging/pino-logger.service.ts` — LoggerService injetável com campos padronizados (correlationId, messageId, transactionId, walletId, providerId)
- `src/infrastructure/observability/logging/pino-logger.service.spec.ts` — 14 testes: níveis de log, context fields, stack trace, timestamps ISO
- `src/infrastructure/observability/logging/logging.module.ts` — Módulo @Global com PinoLoggerService

### Métricas (Prometheus)
- `src/infrastructure/observability/metrics/prometheus-metrics.service.ts` — 12 métricas (6 de negócio + 6 de infraestrutura) com @prometheus-io/client
- `src/infrastructure/observability/metrics/prometheus-metrics.service.spec.ts` — 16 testes: todos os counters, gauge, histogram, timer, formato Prometheus
- `src/infrastructure/observability/metrics/metrics.module.ts` — Módulo @Global com PrometheusMetricsService + MetricsController
- `src/infrastructure/observability/metrics/metrics.controller.ts` — `GET /metrics` com Content-Type Prometheus
- `src/infrastructure/observability/metrics/http-metrics.middleware.ts` — Middleware que rastreia `wager_http_requests_total` e `wager_processing_latency_seconds`

### Health Checks
- `src/infrastructure/observability/health/postgres.health.indicator.ts` — Verifica conexão PostgreSQL via MikroORM
- `src/infrastructure/observability/health/sqs.health.indicator.ts` — Verifica configuração SQS via env var
- `src/infrastructure/observability/health/health.indicator.spec.ts` — 5 testes: healthy, unhealthy, not-configured para ambos indicadores
- `src/api/health/health.controller.ts` — Atualizado com health indicators reais; `/health/ready` retorna 503 se dependência falha
- `src/api/health/health.module.ts` — Providers PostgresHealthIndicator + SqsHealthIndicator

### Integração
- `src/app/app.module.ts` — Imports LoggingModule, MetricsModule; HttpMetricsMiddleware configurado via MiddlewareConsumer
- `src/main.ts` — PinoLoggerService como logger global do NestJS
- `src/application/reconciliation/reconciliation.service.ts` — Integra PrometheusMetricsService + PinoLoggerService para REQ-004 (discrepâncias de reconciliação)

## Dependências Adicionadas
- `pino@10.4.0` — JSON logger
- `pino-pretty@13.2.0` — Pretty print para desenvolvimento
- `@prometheus-io/client@0.16.1` — Métricas Prometheus (substitui deprecated prom-client)

## Requisitos Cobertos
- **REQ-001** Logs Estruturados JSON ✓ — Pino com campos padronizados, correlationId propagado, sem dados sensíveis
- **REQ-002** Métricas ✓ — 12 métricas expostas via `/metrics` em formato Prometheus
- **REQ-003** Health Checks ✓ — `/health/live` (liveness) + `/health/ready` (readiness com PostgreSQL e SQS)
- **REQ-004** Divergências de Reconciliação ✓ — Log ERROR + métrica `wager_reconciliation_discrepancies_total`

## Testes
- 35 testes unitários passando (14 logger + 16 metrics + 5 health)
- Total do projeto: 202 testes passando, 0 falhas
