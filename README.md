# Jungle — Distributed Wagering Processor

Serviço financeiro distribuído que processa transações de apostas recebidas de múltiplos provedores de jogos.

## Pré-requisitos

- **Bun** 1.x — [instalação](https://bun.sh/docs/installation)
- **Docker** e **Docker Compose** — para PostgreSQL, MiniStack (SQS) e Keycloak

## Stack

| Componente | Escolha | Versão |
|------------|---------|--------|
| Runtime | Bun | 1.x |
| Linguagem | TypeScript (strict) | 6 |
| Framework | NestJS | 12.4.0 |
| Banco | PostgreSQL | 18 |
| ORM | MikroORM | 7 |
| Mensageria | AWS SQS via MiniStack | latest |
| Autenticação | Keycloak (OIDC) | 26.8 |
| Logs | Pino | 10 |
| Métricas | @prometheus-io/client | 0.16 |

## Setup Rápido

```bash
# 1. Instalar dependências
bun install

# 2. Iniciar infraestrutura (PostgreSQL, MiniStack, Keycloak)
docker-compose up -d

# 3. Aguardar serviços ficarem saudáveis
# PostgreSQL: localhost:5432
# MiniStack:  localhost:4566
# Keycloak:   localhost:8080

# 4. Iniciar a aplicação
bun run start
```

## Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste conforme necessário:

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DB_HOST` | `localhost` | Host do PostgreSQL |
| `DB_PORT` | `5432` | Porta do PostgreSQL |
| `DB_USER` | `postgres` | Usuário do PostgreSQL |
| `DB_PASSWORD` | `postgres` | Senha do PostgreSQL |
| `DB_NAME` | `jungle` | Nome do banco de dados |
| `AWS_ENDPOINT_URL` | `http://localhost:4566` | Endpoint do MiniStack |
| `AWS_ACCESS_KEY_ID` | `test` | Credencial AWS (MiniStack) |
| `AWS_SECRET_ACCESS_KEY` | `test` | Credencial AWS (MiniStack) |
| `AWS_REGION` | `us-east-1` | Região AWS |
| `SQS_QUEUE_NAME` | `wager-transactions.fifo` | Fila SQS principal |
| `SQS_DLQ_NAME` | `wager-transactions-dlq.fifo` | Fila SQS DLQ |
| `KEYCLOAK_ISSUER` | `http://localhost:8080/auth/realms/jungle` | Issuer OIDC |
| `KEYCLOAK_CLIENT_ID` | `jungle-api` | Client ID OIDC |
| `KEYCLOAK_AUDIENCE` | `jungle-api` | Audience OIDC |

## Scripts

| Comando | Descrição |
|---------|-----------|
| `bun run start` | Inicia a aplicação em modo desenvolvimento |
| `bun run typecheck` | Verifica tipos TypeScript |
| `bun test` | Executa todos os testes |
| `bun test src/` | Executa testes de unidade |
| `bun test test/http/` | Executa testes HTTP de integração (requer banco) |
| `bun test test/integration/` | Executa testes de integração com banco |

## API Endpoints

### Health (públicos)

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/health/live` | Verifica se o processo está vivo |
| GET | `/health/ready` | Verifica PostgreSQL e SQS (503 se indisponível) |
| GET | `/metrics` | Métricas Prometheus |

### Wallets

| Método | Path | Autenticação | Descrição |
|--------|------|--------------|-----------|
| POST | `/wallets` | `jungle-admin` | Cria wallet com saldo inicial |
| GET | `/wallets/:walletId` | `admin`, `operator`, `reader` | Consulta wallet |
| GET | `/wallets/:walletId/ledger` | `admin`, `operator`, `reader` | Ledger com cursor pagination |
| POST | `/wallets/:walletId/reconciliation` | `admin`, `operator` | Reconcilia saldo vs ledger |

### Wagering

| Método | Path | Autenticação | Descrição |
|--------|------|--------------|-----------|
| POST | `/wagering/transactions` | `admin`, `operator` | Submete transação de aposta |
| GET | `/wagering/transactions/:transactionId` | `admin`, `operator`, `reader` | Consulta transação |
| GET | `/providers/:providerId/wagering/transactions/:externalTransactionId` | `admin`, `operator`, `reader` | Consulta por provedor |

### Exemplo: Submeter Transação

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: provider-a:transaction-123" \
  -d '{
    "providerId": "provider-a",
    "externalTransactionId": "transaction-123",
    "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
    "roundId": "round-987",
    "gameId": "fortune-chimp",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }'
```

## Estrutura do Projeto

```
src/
├── api/                          # Camada de API (controllers, DTOs, guards)
│   ├── common/                   # Filtros, interceptadores, guards
│   ├── health/                   # Health checks
│   ├── wallets/                  # CRUD wallets
│   ├── wagering/                 # Transações de aposta
│   └── reconciliation/           # Reconciliação
├── application/                  # Camada de aplicação (services, use cases)
│   ├── idempotency/              # Idempotência persistente
│   ├── reconciliation/           # Serviço de reconciliação
│   ├── wallet/                   # Serviço de wallets
│   ├── wager/                    # ProcessTransaction use case
│   └── workers/                  # Workers agendados
├── auth/                         # Autenticação Keycloak/OIDC
│   ├── decorators/               # @Roles, @Public
│   ├── guards/                   # JwtAuthGuard, RolesGuard
│   └── strategies/               # JwtStrategy
├── domain/                       # Domínio (DDD aggregates)
│   ├── errors/                   # Domain errors
│   ├── failure/                  # FailureCode taxonomy
│   ├── ledger/                   # WalletLedgerEntry
│   ├── messaging/                # Inbox, Outbox, IntegrationEvents
│   ├── money/                    # Money value object
│   ├── transaction/              # WagerTransaction
│   └── wallet/                   # Wallet aggregate root
├── infrastructure/               # Infraestrutura
│   ├── messaging/                # SQS consumer, outbox publisher
│   ├── observability/            # Pino logger, Prometheus, health
│   └── persistence/              # MikroORM entities, repos, migrations
├── app/
│   └── app.module.ts             # Módulo raiz
└── main.ts                       # Bootstrap da aplicação
```

## Invariantes

1. **Dinheiro nunca usa `number`** — Money usa `decimal.js` com string decimal
2. **Saldo nunca negativo** — CHECK constraint no banco + validação no domínio
3. **Ledger balanceado** — `balanceBefore ± money === balanceAfter` validado na factory
4. **Idempotência persistente** — UNIQUE constraint no banco
5. **Transações imutáveis** — estados terminais não mudam

## Documentação

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Decisões arquiteturais, trade-offs e limitações
- **[Challenge.md](./Challenge.md)** — Requisitos completos do desafio
- **[.spec/](./.spec/)** — Especificações, planos, tarefas e sumários SDD

## Testes de Concorrência

Os testes de concorrência verificam o cenário obrigatório do Challenge.md:

> Saldo inicial 100.00 BRL. Duas apostas de 80.00 BRL processadas simultaneamente.
> Resultado: exatamente uma PROCESSED, uma REJECTED, saldo final 20.00 BRL.

```bash
# Executar testes de concorrência HTTP (requer banco PostgreSQL)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/http/concurrency.e2e.spec.ts
```
