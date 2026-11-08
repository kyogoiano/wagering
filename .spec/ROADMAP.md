# Jungle — Roadmap Estratégico

## Visão Geral

O roadmap descreve todas as fases do **Distributed Wagering Processor**, decompostas em 7 especificações atômicas que seguem a ordem de dependência e prioridade do Challenge.md.

Cada fase segue o ciclo SDD (Spec → Plan → Tasks → Implement → Summary) e é implementada com TDD (Test-Driven Development).

## Fases do Projeto

### Fase 1: Core Wagering Domain

**Spec:** [SPEC-000](./SPEC-000-core-wagering-domain.md)
**Plan:** [PLAN-000](./plans/PLAN-000-core-wagering-domain.md)
**Tasks:** [TASKS-000](./tasks/TASKS-000-core-wagering-domain.md)

**Objetivo:** Estabelecer os modelos de domínio imutáveis e as regras de negócio centrais.

**Entregáveis:**
- `Money` — valor monetário imutável com Decimal, validação de escala e moeda
- `Wallet` — aggregate root com saldo, version, debit/credit e ledger interno
- `WagerTransaction` — transação com estados (PENDING→PROCESSED/REJECTED/FAILED), kinds (BET/WIN/LOSS/REFUND/ROLLBACK) e transições
- `WalletLedgerEntry` — lançamento imutável com direção, saldo antes/depois
- `FailureCode` — taxonomia de códigos de falha estáveis
- Repositórios com MikroORM e entities mapeadas
- Migrations DDL com constraints de unicidade, imutabilidade e não-negatividade

**Critérios de Aceitação:**
- Money rejeita entradas inválidas (NaN, Infinity, notação científica, mais de 2 casas)
- Wallet nunca permite saldo negativo
- Toda alteração de saldo gera lançamento no ledger na mesma transação SQL
- Transições de estado de WagerTransaction são válidas e documentadas
- LOSS não gera lançamento no ledger
- REFUND/ROLLBACK validam referência antes de aplicar

**Dependências:** Nenhuma (base de todas as outras fases)

---

### Fase 2: Inbox & Outbox Messaging

**Spec:** [SPEC-000.1](./SPEC-000.1-inbox-outbox-messaging.md)
**Plan:** [PLAN-000.1](./plans/PLAN-000.1-inbox-outbox-messaging.md)
**Tasks:** [TASKS-000.1](./tasks/TASKS-000.1-inbox-outbox-messaging.md)

**Objetivo:** Garantir processamento exatamento-uma-vez com inbox persistente e publicação confiável com outbox.

**Entregáveis:**
- `InboxMessage` — deduplicação por (consumerName, messageId)
- `OutboxMessage` — fila interna com retry e backoff exponencial
- SQS Consumer — recebe de `wager-transactions.fifo`, deduplica via inbox, ack após commit
- Outbox Publisher/Worker — publica eventos pendentes com múltiplos publishers concorrentes
- DLQ Handler — mensagens com tentativas esgotadas vão para `wager-transactions-dlq.fifo`
- Eventos de integração: `WagerTransactionProcessed`, `WagerTransactionRejected`, `WalletBalanceChanged`, `WagerTransactionPendingReference`

**Critérios de Aceitação:**
- Inbox, alteração financeira, ledger e outbox na mesma transação SQL
- Redelivery da mesma mensagem não duplica efeitos
- Worker outbox funciona com múltiplas instâncias concorrentes
- Crash após commit e antes do ack não perde eventos
- DLQ recebe mensagens após limite de tentativas

**Dependências:** Fase 1 (Core Domain)

---

### Fase 3: API HTTP Endpoints

**Spec:** [SPEC-000.2](./SPEC-000.2-api-http-endpoints.md)
**Plan:** [PLAN-000.2](./plans/PLAN-000.2-api-http-endpoints.md)
**Tasks:** [TASKS-000.2](./tasks/TASKS-000.2-api-http-endpoints.md)

**Objetivo:** Expor a API REST para criação de wallets, submissão de transações, consultas e reconciliação.

**Entregáveis:**
- `POST /wallets` — criar wallet com saldo inicial e transação OPENING
- `GET /wallets/:walletId` — consultar wallet e saldo
- `GET /wallets/:walletId/ledger` — ledger com cursor pagination
- `POST /wagering/transactions` — submeter transação com Idempotency-Key
- `GET /wagering/transactions/:transactionId` — consultar transação
- `GET /providers/:providerId/wagering/transactions/:externalTransactionId` — consultar por provedor
- `POST /wallets/:walletId/reconciliation` — verificar consistência saldo vs ledger
- `GET /health/live` e `GET /health/ready` — health checks
- DTOs, guards, exception filters com status HTTP semânticos

**Critérios de Aceitação:**
- Idempotency-Key obrigatório, mesma key + mesmo payload = replay, mesma key + payload diferente = conflito
- Wallet duplicada (playerId + currency) retorna 409
- Status HTTP distinguem: payload inválido, conflito de idempotência, rejeição de negócio, aceite pendente, falha de infraestrutura
- Reconciliação detecta divergências entre saldo materializado e ledger

**Dependências:** Fase 1 (Core Domain), Fase 3 (Concurrency)

---

### Fase 4: Concurrency & Idempotency

**Spec:** [SPEC-000.3](./SPEC-000.3-concurrency-idempotency.md)
**Plan:** [PLAN-000.3](./plans/PLAN-000.3-concurrency-idempotency.md)
**Tasks:** [TASKS-000.3](./tasks/TASKS-000.3-concurrency-idempotency.md)

**Objetivo:** Garantir correção financeira sob concorrência real com múltiplas instâncias.

**Entregáveis:**
- Estratégia de lock por walletId (pessimistic ou optimistic com retry)
- Idempotência persistente via unique constraint em `idempotencyKey`
- Payload hash para detectar replay vs conflito
- Worker para PENDING_REFERENCE com backoff exponencial
- Cenário obrigatório: 2 apostas de 80 BRL com saldo 100 BRL → 1 PROCESSED, 1 REJECTED

**Critérios de Aceitação:**
- Duas apostas simultâneas não causam lost update
- Saldo final correto após concorrência
- Exatamente um débito no ledger para aposta duplicada concorrente
- Solução correta com ≥3 instâncias simultâneas
- Idempotência funciona após restart do processo

**Dependências:** Fase 1 (Core Domain)

---

### Fase 5: Observability & Health

**Spec:** [SPEC-000.4](./SPEC-000.4-observability-health.md)
**Plan:** [PLAN-000.4](./plans/PLAN-000.4-observability-health.md)
**Tasks:** [TASKS-000.4](./tasks/TASKS-000.4-observability-health.md)

**Objetivo:** Logs estruturados, métricas e health checks para diagnóstico e monitoramento.

**Entregáveis:**
- Logger estruturado JSON com correlationId, messageId, transactionId, walletId, providerId
- Métricas: transações por status, duplicatas, retries, DLQ, lock conflicts, outbox lag, latência
- Health checks: liveness (processo vivo) e readiness (PostgreSQL e SQS alcançáveis)
- Sem dados sensíveis nos logs

**Critérios de Aceitação:**
- Logs em JSON parseável com todos os correlation IDs
- Métricas expostas via endpoint ou collector
- Health live retorna 200 quando processo está rodando
- Health ready retorna 503 quando PostgreSQL ou SQS estão indisponíveis

**Dependências:** Fase 1 (Core Domain)

---

### Fase 6: Tests & Concurrency

**Spec:** [SPEC-000.5](./SPEC-000.5-tests-concurrency.md)
**Plan:** [PLAN-000.5](./plans/PLAN-000.5-tests-concurrency.md)
**Tasks:** [TASKS-000.5](./tasks/TASKS-000.5-tests-concurrency.md)

**Objetivo:** Testes de unidade, integração com containers reais e testes de concorrência paralela.

**Entregáveis:**
- Testes unitários: Money, Wallet, WagerTransaction, regras de negócio
- Testes de integração: PostgreSQL e MiniStack reais em containers Docker
- Testes de concorrência: paralelismo real com múltiplos processos
- Cenário obrigatório: 50 apostas idênticas em paralelo → 1 débito
- Teste de reinício do serviço com consistência final

**Critérios de Aceitação:**
- Invariante final: `wallet.balance == saldo reconstruído pelo ledger`
- Testes de integração usam containers reais, não mocks
- Testes de concorrência usam paralelismo real, não mocks sequenciais
- ≥3 processos/instâncias simultâneos nos testes de concorrência
- Worker morto após commit e antes do ack não perde eventos

**Dependências:** Todas as fases anteriores

---

### Fase 7: Auth — Keycloak + OIDC

**Spec:** [SPEC-000.6](./SPEC-000.6-auth-keycloak-oidc.md)
**Plan:** [PLAN-000.6](./plans/PLAN-000.6-auth-keycloak-oidc.md)
**Tasks:** [TASKS-000.6](./tasks/TASKS-000.6-auth-keycloak-oidc.md)

**Objetivo:** Implementar autenticação e autorização via Keycloak com protocolo OIDC, protegendo os endpoints HTTP administrativos.

**Entregáveis:**
- Keycloak configurado via Docker Compose com realm `jungle`
- Client `jungle-api` com Authorization Code e Client Credentials grants
- JWT Strategy com Passport para validação assíncrona de tokens
- JwtAuthGuard para proteger endpoints com decorator `@Public()` para exceções
- RolesGuard para autorização baseada em roles (`jungle-admin`, `jungle-operator`, `jungle-reader`)
- Cache de JWKs com TTL configurável para resiliência
- Endpoints de health e SQS consumer mantidos como abertos

**Critérios de Aceitação:**
- Keycloak sobe via `docker compose up` sem intervenção manual
- Tokens JWT válidos são aceitos nos endpoints protegidos
- Tokens inválidos ou expirados retornam 401
- Roles insuficientes retornam 403
- Health endpoints funcionam sem autenticação
- Falha no Keycloak não derruba a API (tokens cacheados continuam válidos)

**Dependências:** Fase 3 (API HTTP Endpoints)

---

## Ordem de Execução

```
Fase 1: Core Domain
    ↓
Fase 4: Concurrency & Idempotency (paraleliza com Fase 2)
    ↓
Fase 2: Inbox & Outbox Messaging
    ↓
Fase 3: API HTTP Endpoints
    ↓
Fase 5: Observability & Health (paraleliza com Fase 3)
    ↓
Fase 7: Auth — Keycloak + OIDC (paraleliza com Fase 5)
    ↓
Fase 6: Tests & Concurrency
```

## Referências

- [Challenge.md](../Challenge.md) — documento original do desafio
- [ARCH-000](./architecture/ARCH-000-distributed-wagering-processor.md) — arquitetura geral
- [Constitution](../.agents/rules/constitution.md) — invariantes do projeto
