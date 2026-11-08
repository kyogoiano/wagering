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

- SqsHealthIndicator usa env var em vez de conexão real com MiniStack
- Sem testes de integração de health endpoints
