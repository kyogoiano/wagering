# SPEC-000.4: Observability & Health

## Visão Geral

Define os requisitos de observabilidade do sistema: logs estruturados em JSON, métricas de negócio e infraestrutura, e health checks para liveness e readiness.

## Contexto

Para operar um sistema financeiro distribuído em produção, é essencial ter visibilidade sobre o que está acontecendo. Os logs permitem diagnóstico de problemas, as métricas permitem monitoramento proativo, e os health checks permitem orquestração correta por parte do Kubernetes ou Docker Compose.

## Requisitos

### REQ-001: Logs Estruturados JSON

**Descrição:** Todos os logs do sistema são emitidos em formato JSON parseável com campos padronizados.

**Campos Obrigatórios:**

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `timestamp` | ISO-8601 | `2026-07-29T15:00:00.000Z` |
| `level` | Nível do log | `INFO`, `WARN`, `ERROR`, `DEBUG` |
| `message` | Mensagem humana | `Transaction processed` |
| `correlationId` | ID da requisição/mensagem | `corr-abc123` |
| `messageId` | ID da mensagem SQS (se aplicável) | `msg-456` |
| `transactionId` | ID da transação de aposta | `txn-789` |
| `walletId` | ID da wallet afetada | `wallet-001` |
| `providerId` | ID do provedor | `provider-a` |

**Regras:**

1. Sem dados sensíveis nos logs (senhas, tokens, payloads financeiros completos)
2. Cada log é uma linha JSON válida (JSON Lines)
3. CorrelationId é gerado por requisição/mensagem e propagado pelo contexto
4. Em caso de erro, incluir stack trace no campo `stack`

**Critérios de Aceitação:**

- [ ] Todos os logs são JSON parseável
- [ ] CorrelationId presente em todos os logs de uma requisição
- [ ] Sem dados sensíveis nos logs
- [ ] Stack trace em logs de erro

### REQ-002: Métricas

**Descrição:** Métricas de negócio e infraestrutura expostas para monitoramento.

**Métricas de Negócio:**

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `wager_transactions_total` | Counter | Transações por status (processed, rejected, failed, pending_reference) |
| `wager_duplicates_detected_total` | Counter | Duplicatas detectadas por idempotency |
| `wager_retries_total` | Counter | Retries de mensagens por tipo |
| `wager_dlq_total` | Counter | Mensagens enviadas para DLQ |
| `wager_balance_changed_total` | Counter | Alterações de saldo por direção (debit, credit) |

**Métricas de Infraestrutura:**

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `wager_lock_conflicts_total` | Counter | Conflitos de lock detectados |
| `wager_outbox_lag` | Gauge | Número de eventos pendentes na outbox |
| `wager_processing_latency_seconds` | Histogram | Latência de processamento por operação |
| `wager_http_requests_total` | Counter | Requisições HTTP por endpoint e status |
| `wager_sqs_messages_received_total` | Counter | Mensagens SQS recebidas |
| `wager_sqs_messages_acked_total` | Counter | Mensagens SQS acked |

**Exposição:**

- Métricas expostas via endpoint HTTP `/metrics` ou collector Prometheus
- Formato Prometheus text exposition

**Critérios de Aceitação:**

- [ ] Todas as métricas listadas são expostas
- [ ] Métricas distinguem por status, direção, e tipo de erro
- [ ] Outbox lag reflete eventos pendentes reais

### REQ-003: Health Checks

**Descrição:** Endpoints para verificação de saúde do serviço.

**Liveness — `GET /health/live`:**

- Retorna 200 se o processo está rodando
- Não verifica dependências externas
- Usado pelo orquestrador para detectar processos travados

**Readiness — `GET /health/ready`:**

- Retorna 200 se PostgreSQL e SQS estão alcançáveis
- Retorna 503 se qualquer dependência crítica está indisponível
- Usado pelo orquestrador para routing de tráfego

**Regras:**

1. Health checks **não** exigem autenticação
2. Liveness é simples — apenas verifica se o processo responde
3. Readiness verifica conexões reais com dependências

**Critérios de Aceitação:**

- [ ] `/health/live` retorna 200 quando processo está rodando
- [ ] `/health/ready` retorna 200 quando dependências estão disponíveis
- [ ] `/health/ready` retorna 503 quando PostgreSQL está indisponível
- [ ] `/health/ready` retorna 503 quando SQS está indisponível
- [ ] Health checks não exigem autenticação

### REQ-004: Divergências de Reconciliação

**Descrição:** Quando a reconciliação detecta divergência entre saldo materializado e ledger, o evento deve ser registrado.

**Regras:**

1. Divergência é logada com nível ERROR
2. Métrica `wager_reconciliation_discrepancies_total` é incrementada
3. A resposta da API sinaliza `consistent: false`
4. Divergência **não** é corrigida silenciosamente

**Critérios de Aceitação:**

- [ ] Divergência gera log ERROR
- [ ] Métrica de discrepância incrementada
- [ ] API retorna `consistent: false`

## Restrições

1. OpenTelemetry e dashboard são opcionais
2. Sem dados sensíveis ou payloads financeiros completos nos logs
3. Health checks separados para liveness e readiness

## Dependências

- SPEC-000 (Core Wagering Domain)

## Referências

- [Challenge.md §12](../Challenge.md#12-observabilidade) — Observabilidade
