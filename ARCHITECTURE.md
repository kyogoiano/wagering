# ARCHITECTURE — Jungle Distributed Wagering Processor

## 1. Visão Geral

O Jungle é um **serviço financeiro distribuído** que processa transações de apostas recebidas de múltiplos provedores de jogos. O sistema garante correção financeira sob condições adversas: mensagens duplicadas, entregas fora de ordem, processamento simultâneo por múltiplas instâncias e falhas transitórias de infraestrutura.

A unidade de concorrência é a **walletId** — cada wallet é processada de forma serializada, enquanto wallets diferentes são processadas em paralelo.

## 2. Stack Tecnológico

| Componente | Escolha | Versão |
|------------|---------|--------|
| Runtime | Bun | 1.x |
| Linguagem | TypeScript (strict) | 6 |
| Framework | NestJS | 12.4.0 |
| Banco de dados | PostgreSQL | 18 (com pgvector) |
| ORM | MikroORM | 7 |
| Mensageria | AWS SQS via MiniStack | latest |
| Autenticação | Keycloak (OIDC) | 26.8 |
| Logs | Pino | 10 |
| Métricas | @prometheus-io/client | 0.16 |
| Testes | Bun test runner | nativo |
| Containerização | Docker Compose | — |

## 3. Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                           │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐  │
│  │ Keycloak │   │Keycloak  │   │MiniStack │   │ PostgreSQL │  │
│  │ (OIDC)   │──▶│ DB       │   │ (SQS)    │   │ (18)       │  │
│  │ :8080    │   │ :5433    │   │ :4566    │   │ :5432      │  │
│  └──────────┘   └──────────┘   └────┬─────┘   └──────┬─────┘  │
│                                      │                │         │
└──────────────────────────────────────┼────────────────┼─────────┘
                                       │                │
                    ┌──────────────────┼────────────────┼─────────┐
                    │             Aplicação NestJS (múltiplas instâncias) │
                    │                                                     │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │                    API Layer                              │         │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐ │         │
│  │  │ HealthCtrl  │ │ WalletsCtrl  │ │ WageringCtrl      │ │         │
│  │  │ (GET /health)│ │ (CRUD)       │ │ (POST /transactions)│        │
│  │  └─────────────┘ └──────────────┘ └───────────────────┘ │         │
│  │  ┌─────────────┐ ┌──────────────┐                       │         │
│  │  │ ReconcCtrl  │ │ Auth Guards  │                       │         │
│  │  │ (reconciliation)│ (JWT + Roles)│                     │         │
│  │  └─────────────┘ └──────────────┘                       │         │
│  └──────────────────────────────────────────────────────────┘         │
│                               │                                       │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │              Application Layer                            │         │
│  │  ┌──────────────────┐ ┌──────────────────────────────┐  │         │
│  │  │ ProcessTransaction│ │ IdempotencyService           │  │         │
│  │  │ (use case)       │ │ (dedup + payload hash)       │  │         │
│  │  └────────┬─────────┘ └──────────────────────────────┘  │         │
│  │           │                                              │         │
│  │  ┌────────┴─────────┐ ┌──────────────────────────────┐  │         │
│  │  │ WalletService    │ │ TransactionService            │  │         │
│  │  │ (CRUD wallets)   │ │ (lock pessimistic + domain)  │  │         │
│  │  └──────────────────┘ └──────────────────────────────┘  │         │
│  └──────────────────────────────────────────────────────────┘         │
│                               │                                       │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │              Domain Layer (DDD Aggregates)                │         │
│  │  Money │ Wallet │ WagerTransaction │ WalletLedgerEntry   │         │
│  │  FailureCode │ IntegrationEvent (base + 4 concretos)     │         │
│  └──────────────────────────────────────────────────────────┘         │
│                               │                                       │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │           Infrastructure Layer                            │         │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │         │
│  │  │ MikroORM     │ │ SQS Consumer │ │ Outbox Publisher │ │         │
│  │  │ (5 entities) │ │ (polling +   │ │ (@Cron worker)   │ │         │
│  │  │ 3 repos      │ │  inbox dedup)│ │ (backoff retry)  │ │         │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘ │         │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │         │
│  │  │ Pino Logger  │ │ Prometheus   │ │ Health Indicators│ │         │
│  │  │ (JSON)       │ │ Metrics      │ │ (PG + SQS)       │ │         │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘ │         │
│  └──────────────────────────────────────────────────────────┘         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## 4. Estratégias de Concorrência

### 4.1 Pessimistic Locking por WalletId

**Decisão:** Usar `SELECT ... FOR UPDATE` (pessimistic write lock) na wallet antes de qualquer operação financeira.

**Justificativa:**
- Garante serialização estrita por walletId sem lost updates
- PostgreSQL gerencia o lock automaticamente — sem risco de race conditions
- Bloqueio granular: apenas a wallet em disputa é bloqueada, não o sistema todo
- Compatível com múltiplas instâncias da aplicação

**Implementação:**
```typescript
const walletEntity = await this.walletRepository.findOneForUpdate(walletId);
```

**Alternativas rejeitadas:**
- **Optimistic locking com version:** Rejeitado porque exigiria retry loop na aplicação, aumentando latência e complexidade. Em sistemas financeiros, é preferível bloquear do que retry.
- **Lock global:** Rejeitado explicitamente pelo Challenge.md (§5) — eliminaria todo paralelismo.
- **UPDATE WHERE balance >= amount:** Rejeitado porque não permite acesso ao estado atual da wallet para gerar ledger entries corretas.

### 4.2 Idempotência Persistente

**Decisão:** Usar `idempotencyKey` única no banco + `payloadHash` SHA-256 para detecção de replay vs conflito.

**Fluxo:**
1. Verificar se `idempotencyKey` já existe no banco
2. Se existir e `payloadHash` igual → retornar resultado original (replay idempotente)
3. Se existir e `payloadHash` diferente → retornar 409 Conflict
4. Se não existir → processar normalmente

**Garantia:** A constraint `UNIQUE (idempotency_key)` no banco impede duplicação mesmo com múltiplas instâncias.

### 4.3 Outbox com SKIP LOCKED

**Decisão:** Usar `SELECT ... FOR UPDATE SKIP LOCKED` no outbox publisher para suportar múltiplos workers concorrentes.

**Justificativa:**
- Dois workers não publicam o mesmo evento
- `SKIP LOCKED` evita deadlocks entre workers
- Cada worker processa um lote diferente de mensagens

## 5. Schema do Banco

### 5.1 Tabelas

```sql
-- 5 tabelas principais

wallets (id, player_id, currency, balance_amount, balance_currency, version, created_at, updated_at)
wager_transactions (id, provider_id, external_transaction_id, idempotency_key, payload_hash,
                     wallet_id, player_id, round_id, game_id, kind, money_amount, money_currency,
                     reference_external_transaction_id, status, failure_code, processed_at,
                     attempts, next_attempt_at, created_at)
wallet_ledger_entries (id, wallet_id, transaction_id, direction, money_amount, money_currency,
                        balance_before_amount, balance_before_currency,
                        balance_after_amount, balance_after_currency, created_at)
inbox_messages (message_id, consumer_name, payload_hash, received_at, processed_at)
outbox_messages (id, aggregate_id, event_type, payload, occurred_at, attempts,
                  next_attempt_at, published_at)
```

### 5.2 Constraints Autoritativas

| Constraint | Tabela | Propósito |
|------------|--------|-----------|
| `CHECK (balance_amount >= 0)` | wallets | Saldo nunca negativo |
| `UNIQUE (player_id, currency)` | wallets | Uma wallet por player+moeda |
| `UNIQUE (idempotency_key)` | wager_transactions | Idempotência persistente |
| `CHECK (direction IN ('DEBIT', 'CREDIT'))` | wallet_ledger_entries | Direção válida |
| `CHECK (money_amount >= 0)` | wallet_ledger_entries | Valor não negativo |
| `UNIQUE (message_id, consumer_name)` | inbox_messages | Deduplicação por consumidor |
| `CHECK (status IN (...))` | wager_transactions | Estados válidos |

### 5.3 Índices

| Índice | Tabela | Propósito |
|--------|--------|-----------|
| `(wallet_id, created_at DESC)` | wallet_ledger_entries | Cursor pagination do ledger |
| `(provider_id, external_transaction_id)` | wager_transactions | Busca por provedor |
| `(wallet_id, status)` | wager_transactions | Consulta de transações por wallet |
| `(status, created_at)` | wager_transactions | PendingReferenceWorker |
| `(published_at, next_attempt_at)` | outbox_messages | Outbox Publisher Worker |

## 6. Fluxo de Dados

### 6.1 API HTTP

```
Request POST /wagering/transactions
    │
    ▼
┌─────────────────────────────────┐
│  IdempotencyKeyGuard            │ ← Valida header Idempotency-Key
│  CorrelationIdInterceptor       │ ← Gera correlationId
│  ValidationPipe                 │ ← Valida DTO
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  WageringController             │
│    └─ TransactionService        │
│         ├─ IdempotencyService   │ ← Verifica replay/conflito
│         ├─ findOneForUpdate()   │ ← Lock pessimistic na wallet
│         ├─ WagerTransaction     │ ← Domain: cria transação
│         ├─ Wallet.debit/credit  │ ← Domain: altera saldo + ledger
│         ├─ Persist entities     │ ← MikroORM flush
│         └─ Outbox enqueue       │ ← Evento na outbox (mesma tx)
└─────────────────────────────────┘
    │
    ▼
Response 201 { transactionId, status, balance, idempotentReplay }
```

### 6.2 SQS Consumer

```
Mensagem SQS (wager-transactions.fifo)
    │
    ▼
┌─────────────────────────────────┐
│  SQS Consumer (polling loop)    │
│    ├─ receiveMessage()          │
│    ├─ Inbox deduplicação        │ ← (consumerName, messageId)
│    └─ ProcessTransaction        │ ← Mesmo use case da API HTTP
│         ├─ Lock pessimistic     │
│         ├─ Domain processing    │
│         ├─ Persist + outbox     │ ← Mesma transação SQL
│         └─ deleteMessage()      │ ← Ack após commit
└─────────────────────────────────┘
    │
    ▼
Se erro de negócio → ack (sem retry)
Se erro de infraestrutura → visibility timeout controla retry
Após maxReceiveCount → DLQ automática
```

### 6.3 Outbox Publisher

```
@Cron a cada 15 segundos
    │
    ▼
┌─────────────────────────────────┐
│  OutboxPublisherWorker          │
│    ├─ SELECT ... FOR UPDATE     │
│    │   SKIP LOCKED              │ ← Múltiplos workers seguros
│    ├─ Para cada mensagem:       │
│    │   ├─ Serializar payload    │
│    │   ├─ Publicar (log/SQS)    │
│    │   └─ published_at = NOW()  │
│    └─ Em falha:                 │
│       ├─ attempts++             │
│       └─ next_attempt_at =      │
│            backoff(attempts)    │
└─────────────────────────────────┘
```

## 7. Decisões Arquiteturais

### D-001: Money como Value Object Imutável

**Decisão:** `Money` é imutável, usa `decimal.js` internamente, serializa como string decimal.

**Justificativa:** O Challenge.md proíbe `number`, `float` e `double` para dinheiro. A imutabilidade elimina riscos de mutação acidental em transações concorrentes.

### D-002: Wallet como Aggregate Root

**Decisão:** `Wallet` é o aggregate root que encapsula saldo, version e ledger entries.

**Justificativa:** Todas as invariantes financeiras (saldo não negativo, ledger balanceado) são verificadas dentro do aggregate, garantindo consistência.

### D-003: Pessimistic Locking

**Decisão:** `SELECT ... FOR UPDATE` na wallet antes de operações financeiras.

**Justificativa:** Ver seção 4.1.

### D-004: Outbox Pattern para Eventos

**Decisão:** Eventos de integração são persistidos na tabela `outbox_messages` na mesma transação SQL que a operação financeira.

**Justificativa:** Garante que eventos nunca são perdidos — se o commit financeiro ocorre, o evento está na outbox. O worker publica de forma assíncrona com retry.

### D-005: Inbox Pattern para SQS

**Decisão:** Mensagens SQS são deduplicadas via tabela `inbox_messages` com unique constraint `(message_id, consumer_name)`.

**Justificativa:** SQS é at-least-once — mensagens podem ser entregues mais de uma vez. O inbox persistente garante processamento exatamente-uma-vez.

### D-006: Keycloak para Autenticação

**Decisão:** Keycloak como IdP externo com OIDC, JWT validation assíncrona via JWKs cache.

**Justificativa:** O Challenge.md sugere Keycloak como opção principal. Evita autenticação artesanal. Health endpoints permanecem abertos.

### D-007: MiniStack para SQS Local

**Decisão:** MiniStack (`ministackorg/ministack`) como emulador AWS local, gratuito e open-source (MIT).

**Justificativa:** O Challenge.md exige AWS SQS via MiniStack. MiniStack é mais leve que LocalStack (~30MB vs ~500MB), suporta SQS FIFO, e é compatível com AWS SDK v3.

## 8. Trade-offs

### T-001: Pessimistic vs Optimistic Locking

| Critério | Pessimistic | Optimistic |
|----------|-------------|------------|
| Corretude | Garantida | Depende de retry |
| Latência | Maior (lock) | Menor (sem lock) |
| Complexidade | Menor | Maior (retry loop) |
| Throughput | Menor (bloqueio) | Maior (sem bloqueio) |

**Escolha:** Pessimistic — prioriza corretude financeira sobre throughput.

### T-002: MiniStack vs LocalStack

| Critério | MiniStack | LocalStack |
|----------|-----------|------------|
| Licença | MIT (gratuito) | BSL (pagamento) |
| Memória | ~30MB | ~500MB |
| SQS FIFO | ✅ | ✅ |
| AWS SDK v3 | ✅ | ✅ |

**Escolha:** MiniStack — gratuito, leve e compatível.

### T-003: Pino vs Winston

| Critério | Pino | Winston |
|----------|------|---------|
| Performance | Mais rápido | Mais lento |
| JSON nativo | Sim | Precisa de formatter |
| Ecossistema | Node.js padrão | Mais plugins |

**Escolha:** Pino — performance e JSON nativo são críticos para observabilidade.

## 9. Limitações

### L-001: Testes de Concorrência Real

Os testes de concorrência com múltiplas instâncias ainda não foram implementados. A infraestrutura Supertest está configurada, mas os testes pendentes expõem bugs de aplicação (wallet version starting at 1, UUID validation returning 500) que precisam ser corrigidos.

### L-002: SQS Consumer

O SQS consumer e o outbox publisher worker ainda não foram implementados. A spec SPEC-000.7 define o que precisa ser feito.

### L-003: Double-Entry Bookkeeping

O ledger é single-entry (uma entrada por transação). Double-entry é um diferencial opcional não implementado.

### L-004: OpenTelemetry

Logs estruturados e métricas Prometheus estão implementados, mas OpenTelemetry (tracing distribuído) é opcional e não foi implementado.

### L-005: Dashboard

Não há dashboard de métricas implementado. O endpoint `/metrics` expõe dados Prometheus, mas a visualização é responsabilidade do operador.

## 10. Autenticação

A autenticação foi implementada na SPEC-000.6 usando Keycloak + OIDC:

- **JwtAuthGuard** — validação assíncrona de tokens JWT via JWKs cache
- **RolesGuard** — autorização baseada em roles (`jungle-admin`, `jungle-operator`, `jungle-reader`)
- **@Public()** — decorator para endpoints abertos (health)
- **@Roles()** — decorator para endpoints protegidos por role

Os endpoints de health e o SQS consumer não exigem autenticação.

## 11. Invariantes Autoritativas

1. **Dinheiro nunca usa number** — Money usa `decimal.js` com string decimal
2. **Saldo nunca negativo** — CHECK constraint no banco + validação no domínio
3. **Ledger balanceado** — `balanceBefore ± money === balanceAfter` validado na factory
4. **Idempotência persistente** — UNIQUE constraint no banco
5. **Transações imutáveis** — estados terminais não mudam
6. **Inbox deduplicação** — UNIQUE constraint no banco
7. **Outbox atômico** — mesma transação SQL que a operação financeira
