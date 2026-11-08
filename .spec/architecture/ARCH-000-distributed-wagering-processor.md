# ARCH-000: Distributed Wagering Processor

## Visão Geral

Arquitetura do serviço **Jungle — Distributed Wagering Processor**, um sistema financeiro distribuído que processa transações de apostas de múltiplos provedores de jogos com correção financeira, idempotência persistente e consistência entre saldo materializado e ledger auditável.

## Topologia Macro

```
┌─────────────────────────────────────────────────────────────┐
│                        Load Balancer                        │
└───────────────┬───────────────────────┬─────────────────────┘
                │                       │
     ┌──────────▼──────────┐   ┌────────▼──────────────┐
     │   Instance 1        │   │   Instance 2          │   ...
     │  ┌───────────────┐  │   │  ┌───────────────┐    │
     │  │  NestJS App   │  │   │  │  NestJS App   │    │
     │  │  (HTTP + SQS) │  │   │  │  (HTTP + SQS) │    │
     │  └───────┬───────┘  │   │  └───────┬───────┘    │
     └──────────┼──────────┘   └──────────┼────────────┘
                │                       │
        ┌───────▼───────────────────────▼───────┐
        │           PostgreSQL                  │
        │  ┌────────────────────────────────┐   │
        │  │  wallets                       │   │
        │  │  wager_transactions            │   │
        │  │  wallet_ledger_entries         │   │
        │  │  inbox_messages                │   │
        │  │  outbox_messages               │   │
        │  └────────────────────────────────┘   │
        └───────────────────────────────────────┘
        ┌───────────────────────────────────────┐
        │           MiniStack (SQS)             │
        │  wager-transactions.fifo              │
        │  wager-transactions-dlq.fifo          │
        └───────────────────────────────────────┘
        ┌───────────────────────────────────────┐
        │          Keycloak (OIDC IdP)          │
        │  ┌────────────────────────────────┐   │
        │  │  PostgreSQL (Keycloak DB)      │   │
        │  │  realm: jungle                 │   │
        │  │  client: jungle-api            │   │
        │  │  roles: admin/operator/reader  │   │
        │  └────────────────────────────────┘   │
        └───────────────────────────────────────┘
```

## Componentes

### 1. NestJS Application

Aplicação principal que expõe:

- **HTTP API** — endpoints REST para wallets, transações, reconciliação e health
- **SQS Consumer** — consome mensagens de `wager-transactions.fifo`
- **Outbox Worker** — publica eventos pendentes da outbox
- **Pending Reference Worker** — reprocessa transações com referência ausente

### 2. Domain Layer

Camada de domínio pura, sem dependências de framework:

- `Money` — valor monetário imutável
- `Wallet` — aggregate root com saldo e ledger
- `WagerTransaction` — transação com estados e transições
- `WalletLedgerEntry` — lançamento imutável
- `InboxMessage` — deduplicação de mensagens
- `OutboxMessage` — fila de eventos pendentes
- `IntegrationEvent` — envelope de eventos de integração

### 3. Infrastructure Layer

Adaptação para tecnologias externas:

- **MikroORM** — Unit of Work, Identity Map, LockMode
- **PostgreSQL** — banco relacional com constraints
- **MiniStack/SQS** — mensageria FIFO
- **Keycloak** — Identity Provider via OIDC
- **Pino** — logger estruturado JSON
- **Prometheus** — métricas

### 4. Application Layer

Use cases que orquestram domínio e infraestrutura:

- `CreateWalletCommand` — cria wallet com saldo inicial
- `SubmitWagerTransactionCommand` — submete transação (compartilhado HTTP/SQS)
- `ReconcileWalletCommand` — verifica consistência saldo vs ledger
- `PublishOutboxEventsJob` — publica eventos pendentes
- `ProcessPendingReferencesJob` — reprocessa referências ausentes

### 5. Auth Layer

Camada de autenticação e autorização:

- **JwtAuthGuard** — valida tokens JWT via JWKs do Keycloak
- **RolesGuard** — autoriza por roles (`jungle-admin`, `jungle-operator`, `jungle-reader`)
- **JWT Strategy** — Passport strategy com cache de JWKs
- **@Public()** — decorator para endpoints abertos (health, SQS)
- **@Roles()** — decorator para endpoints protegidos por role

## Fluxo de Dados

### Fluxo HTTP — Submissão de Transação

```
Client → POST /wagering/transactions
       → Idempotency Check (unique constraint)
       → Lock Wallet (SELECT ... FOR UPDATE)
       → Validate & Apply (debit/credit)
       → Persist: Wallet + Ledger + Outbox (same transaction)
       → Commit
       → Return 200 with result
```

### Fluxo SQS — Processamento de Mensagem

```
SQS → Consumer receives message
    → Inbox Check (deduplication)
    → Idempotency Check
    → Lock Wallet
    → Validate & Apply
    → Persist: Inbox + Wallet + Ledger + Outbox (same transaction)
    → Commit
    → ACK message
```

### Fluxo Outbox — Publicação de Eventos

```
Worker → SELECT pending outbox messages (nextAttemptAt <= now)
       → FOR UPDATE SKIP LOCKED (concurrent publishers)
       → Publish each event
       → Mark as published
       → On failure: schedule retry with backoff
```

## Estratégia de Concorrência

### Pessimistic Locking

A estratégia primária utiliza **pessimistic locking** do PostgreSQL via `SELECT ... FOR UPDATE`:

1. Cada operação que modifica o saldo de uma wallet inicia uma transação SQL
2. A wallet é carregada com `SELECT ... FOR UPDATE` — bloqueia a linha até o commit
3. A operação é aplicada (debit/credit) dentro da transação
4. Wallet, ledger entry e outbox event são persistidos na mesma transação
5. O commit libera o lock

**Vantagens:**

- Simplicidade — o banco gerencia os locks
- Sem retry loop — a operação espera o lock
- Correto por construção — serialização garantida pelo banco

**Desvantagens:**

- Latência sob contenção — operações bloqueiam
- Risco de deadlock se houver ordem inconsistente de locks (não se aplica aqui, pois a unidade de lock é a walletId)

### Unidade de Concorrência

A unidade de concorrência é a `walletId`. Duas operações na mesma wallet são serializadas. Operações em wallets diferentes são processadas em paralelo sem bloqueio mútuo.

### Outbox — Concurrent Publishers

Para o outbox, múltiplos workers competem por eventos pendentes usando `SELECT ... FOR UPDATE SKIP LOCKED`:

1. Cada worker seleciona eventos pendentes com `SKIP LOCKED`
2. O worker que "ganha" o lock processa o evento
3. Outros workers pulam a linha travada e pegam a próxima
4. Após publicação, o evento é marcado como publicado

## Schema PostgreSQL

### Tabelas Principais

```sql
-- Wallets
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL,
    currency        CHAR(3) NOT NULL CHECK (char_length(currency) = 3),
    balance_amount  NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_wallet_player_currency UNIQUE (player_id, currency)
);

-- Wager Transactions
CREATE TABLE wager_transactions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id                     VARCHAR(255) NOT NULL,
    external_transaction_id         VARCHAR(255) NOT NULL,
    idempotency_key                 VARCHAR(512) NOT NULL,
    payload_hash                    VARCHAR(64) NOT NULL,
    wallet_id                       UUID NOT NULL REFERENCES wallets(id),
    player_id                       UUID NOT NULL,
    round_id                        VARCHAR(255) NOT NULL,
    game_id                         VARCHAR(255) NOT NULL,
    kind                            VARCHAR(20) NOT NULL,
    money_amount                    NUMERIC(20,2) NOT NULL,
    money_currency                  CHAR(3) NOT NULL,
    reference_external_transaction_id VARCHAR(255),
    status                          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reference_transaction_id        UUID REFERENCES wager_transactions(id),
    failure_code                    VARCHAR(50),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at                    TIMESTAMPTZ,
    CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT uq_provider_external_tx UNIQUE (provider_id, external_transaction_id)
);

-- Wallet Ledger Entries (immutable)
CREATE TABLE wallet_ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    transaction_id  UUID NOT NULL REFERENCES wager_transactions(id),
    direction       VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount          NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
    currency        CHAR(3) NOT NULL,
    balance_before  NUMERIC(20,2) NOT NULL CHECK (balance_before >= 0),
    balance_after   NUMERIC(20,2) NOT NULL CHECK (balance_after >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ledger_transaction UNIQUE (transaction_id)
);

-- Inbox Messages
CREATE TABLE inbox_messages (
    message_id    VARCHAR(255) NOT NULL,
    consumer_name VARCHAR(255) NOT NULL,
    payload_hash  VARCHAR(64) NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at  TIMESTAMPTZ,
    PRIMARY KEY (message_id, consumer_name)
);

-- Outbox Messages
CREATE TABLE outbox_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id    UUID NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    CONSTRAINT chk_outbox_pending CHECK (
        (published_at IS NULL AND attempts < 5) OR
        (published_at IS NOT NULL)
    )
);

-- Índices
CREATE INDEX idx_ledger_wallet ON wallet_ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_outbox_pending ON outbox_messages(next_attempt_at) WHERE published_at IS NULL;
CREATE INDEX idx_tx_idempotency ON wager_transactions(idempotency_key);
CREATE INDEX idx_tx_provider_external ON wager_transactions(provider_id, external_transaction_id);
CREATE INDEX idx_tx_wallet ON wager_transactions(wallet_id);
CREATE INDEX idx_tx_status ON wager_transactions(status);
```

### Constraints Autoritativas

| Constraint | Tabela | Coluna(s) | Garantia |
|-----------|--------|-----------|----------|
| `CHECK (balance_amount >= 0)` | wallets | balance_amount | Saldo nunca negativo no banco |
| `UNIQUE (player_id, currency)` | wallets | player_id, currency | Uma wallet por player+moeda |
| `UNIQUE (idempotency_key)` | wager_transactions | idempotency_key | Idempotência persistente |
| `UNIQUE (provider_id, external_transaction_id)` | wager_transactions | provider_id, external_transaction_id | Uma transação externa por provedor |
| `UNIQUE (transaction_id)` | wallet_ledger_entries | transaction_id | Um lançamento por transação |
| `CHECK (direction IN ('DEBIT', 'CREDIT'))` | wallet_ledger_entries | direction | Direção válida |
| `CHECK (amount >= 0)` | wallet_ledger_entries | amount | Valor não negativo |
| Imutabilidade | wallet_ledger_entries | — | Sem UPDATE/DELETE (apenas INSERT) |

## Invariantes Autoritativas

1. **Saldo nunca negativo** — garantido por `CHECK` constraint no banco e validação no domínio
2. **Consistência saldo/ledger** — toda alteração de saldo gera lançamento na mesma transação SQL
3. **Idempotência persistente** — unique constraint em `idempotency_key`
4. **Imutabilidade do ledger** — apenas INSERT em `wallet_ledger_entries`
5. **Atomicidade** — wallet, ledger, inbox e outbox na mesma transação SQL
6. **Uma wallet por player+moeda** — unique constraint no banco
7. **Uma transação externa por provedor** — unique constraint no banco

## Decisões Arquiteturais

### DDD — Domain-Driven Design

O domínio é modelado com DDD tático:

- **Aggregate Root** — `Wallet` é o aggregate root; `WagerTransaction` e `WalletLedgerEntry` são entidades dentro do aggregate
- **Value Object** — `Money` é um value object imutável
- **Domain Events** — eventos de integração são publicados via outbox
- **Repositories** — cada aggregate tem um repository que abstrai a persistência

### MikroORM — Unit of Work

MikroORM é usado como ORM com:

- **Unit of Work** — rastreamento de mudanças e persistência em lote
- **Identity Map** — instâncias únicas por entity dentro de um EntityManager
- **LockMode** — `PESSIMISTIC_WRITE` para locks pessimistas
- **EntityManager.transactional()** — transações explícitas

### Money — Decimal String

Money é representado como `Decimal` (biblioteca `decimal.js` ou `decimal.js-light`) internamente e serializado como string decimal com escala fixa de 2 casas. Na persistência, usa `NUMERIC(20,2)` do PostgreSQL.

### Autenticação — Identity Provider Externo

A autenticação usa **Keycloak** como Identity Provider via **OIDC (OpenID Connect)**:

- **Realm:** `jungle` com client `jungle-api` (confidential)
- **Fluxos:** Authorization Code (usuários) + Client Credentials (serviços)
- **Tokens:** JWT assinados com RS256, validação assíncrona via JWKs
- **Roles:** `jungle-admin`, `jungle-operator`, `jungle-reader`
- **Cache de JWKs:** TTL configurável para resiliência
- **Endpoints abertos:** health checks e SQS consumer
- **Docker Compose:** Keycloak sobe com PostgreSQL dedicado

## Trade-offs

| Decisão | Vantagem | Desvantagem |
|---------|----------|-------------|
| Pessimistic locking | Simplicidade, correção garantida | Latência sob contenção |
| Outbox pattern | Confiabilidade, crash recovery | Complexidade do worker |
| Inbox persistente | Deduplicação confiável | Overhead de storage |
| MikroORM | Unit of Work, Identity Map | Curva de aprendizado |
| Decimal.js | Precisão exata | Performance vs number |

## Limitações Conhecidas

1. Double-entry bookkeeping é opcional — o ledger é single-entry
2. OpenTelemetry é opcional — logs e métricas básicas são obrigatórios
3. Autenticação implementada com Keycloak — endpoints de health abertos
4. Teste de carga é opcional — testes de concorrência são obrigatórios

## Referências

- [Challenge.md](../Challenge.md) — documento original do desafio
- [SPEC-000](./SPEC-000-core-wagering-domain.md) — domínio central
- [SPEC-000.1](./SPEC-000.1-inbox-outbox-messaging.md) — mensageria
- [SPEC-000.3](./SPEC-000.3-concurrency-idempotency.md) — concorrência
- [SPEC-000.6](./SPEC-000.6-auth-keycloak-oidc.md) — autenticação Keycloak + OIDC
