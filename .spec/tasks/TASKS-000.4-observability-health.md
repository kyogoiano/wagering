# TASKS-000.4: Observability & Health

## Tarefas em Ordem TDD

### 1. Logger

- [ ] **T120:** Configurar Pino como logger do NestJS
- [ ] **T121:** Implementar `PinoLoggerService` injetável
- [ ] **T122:** Implementar `CorrelationIdMiddleware`
- [ ] **T123:** Escrever testes para logs estruturados JSON

### 2. Métricas

- [ ] **T124:** Configurar Prometheus client
- [ ] **T125:** Implementar métricas de negócio (transactions, duplicates, retries, DLQ)
- [ ] **T126:** Implementar métricas de infraestrutura (lock conflicts, outbox lag, latency)
- [ ] **T127:** Implementar `GET /metrics`
- [ ] **T128:** Integrar métricas com use cases

### 3. Health Checks

- [ ] **T129:** Implementar `GET /health/live`
- [ ] **T130:** Implementar PostgreSQL health indicator
- [ ] **T131:** Implementar SQS health indicator
- [ ] **T132:** Implementar `GET /health/ready`
- [ ] **T133:** Escrever testes para health checks

### 4. Reconciliação

- [ ] **T134:** Implementar métrica de discrepância de reconciliação
- [ ] **T135:** Implementar log ERROR para divergências
