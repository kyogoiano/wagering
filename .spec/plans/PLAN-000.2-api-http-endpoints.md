# PLAN-000.2: API HTTP Endpoints

## Visão Geral

Plano de implementação dos endpoints HTTP: wallets, transações, reconciliação e health checks.

## Módulos NestJS

```
src/
├── api/
│   ├── wallets/
│   │   ├── wallets.controller.ts
│   │   ├── wallets.module.ts
│   │   ├── dto/
│   │   │   ├── create-wallet.dto.ts
│   │   │   ├── wallet-response.dto.ts
│   │   │   ├── ledger-entry-response.dto.ts
│   │   │   └── ledger-page-response.dto.ts
│   │   └── wallets-query.service.ts
│   ├── wagering/
│   │   ├── wagering.controller.ts
│   │   ├── wagering.module.ts
│   │   ├── dto/
│   │   │   ├── submit-transaction.dto.ts
│   │   │   └── transaction-response.dto.ts
│   │   └── submit-wager-transaction.usecase.ts
│   ├── reconciliation/
│   │   ├── reconciliation.controller.ts
│   │   ├── reconciliation.module.ts
│   │   ├── dto/
│   │   │   └── reconciliation-response.dto.ts
│   │   └── reconcile-wallet.usecase.ts
│   ├── health/
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   └── common/
│       ├── guards/
│       │   └── idempotency-key.guard.ts
│       ├── filters/
│       │   └── business-exception.filter.ts
│       └── interceptors/
│           └── correlation-id.interceptor.ts
```

## Controllers

| Controller | Endpoints |
|------------|-----------|
| `WalletsController` | POST /wallets, GET /wallets/:walletId, GET /wallets/:walletId/ledger |
| `WageringController` | POST /wagering/transactions, GET /wagering/transactions/:id, GET /providers/:providerId/wagering/transactions/:externalId |
| `ReconciliationController` | POST /wallets/:walletId/reconciliation |
| `HealthController` | GET /health/live, GET /health/ready |

## DTOs

| DTO | Descrição |
|-----|-----------|
| `CreateWalletDto` | playerId, initialBalance |
| `SubmitTransactionDto` | providerId, externalTransactionId, playerId, walletId, roundId, gameId, kind, money |
| `WalletResponseDto` | id, playerId, balance, version |
| `TransactionResponseDto` | transactionId, status, balance, idempotentReplay |
| `ReconciliationResponseDto` | walletId, storedBalance, calculatedBalance, difference, consistent, checkedEntries |

## Guards & Filters

| Componente | Responsabilidade |
|------------|-----------------|
| `IdempotencyKeyGuard` | Valida presença do header Idempotency-Key |
| `BusinessExceptionFilter` | Mapeia erros de domínio para status HTTP semânticos |
| `CorrelationIdInterceptor` | Gera e propaga correlationId |

## Mapeamento de Erros

| Erro de Domínio | Status HTTP |
|----------------|-------------|
| Payload inválido | 400 |
| Idempotency-Key ausente | 400 |
| Conflito de idempotência | 409 |
| Wallet não encontrada | 404 |
| Wallet já existe | 409 |
| Rejeição por regra de negócio | 422 |
| Transação pendente | 202 |
| Falha de infraestrutura | 503 |

## Ordem de Implementação (TDD)

1. DTOs com validação (class-validator)
2. Exception filters com mapeamento de status HTTP
3. CorrelationId interceptor
4. Health controller (live e ready)
5. Wallets controller (create, get, ledger)
6. Wagering controller (submit, get)
7. Reconciliation controller
8. Idempotency key guard
9. Integração com use cases compartilhados (HTTP + SQS)
