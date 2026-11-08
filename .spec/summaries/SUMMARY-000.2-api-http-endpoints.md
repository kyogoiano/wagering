# SUMMARY-000.2: API HTTP Endpoints

## Status

✓ Concluído

## O que foi implementado

- **4 Controllers** — HealthController (`/health`, `/health/ready`), WalletsController (`GET /wallets`, `GET /wallets/:id`), WageringController (`POST /transactions`), ReconciliationController (`GET /reconciliation/:walletId`)
- **DTOs** — CreateWalletDto, WalletResponseDto, SubmitTransactionDto, TransactionResponseDto, ReconciliationResponseDto com class-validator
- **Services** — WalletService, TransactionService, ReconciliationService conectando controllers ao domínio e persistência
- **PersistenceModule** — Módulo @Global com MikroORM, 5 entities, 3 repositories exportados
- **3 Repositories** — WalletRepository (findByPlayerId, findOneForUpdate), WagerTransactionRepository (findByIdempotencyKey, findByPayloadHash, findPendingReferencesDue), WalletLedgerEntryRepository (findByWalletId com cursor pagination)
- **BusinessExceptionFilter** — Converte domain errors para HTTP responses adequadas
- **CorrelationIdInterceptor** — Gera/injeta correlationId em todos os requests
- **IdempotencyKeyGuard** — Valida header Idempotency-Key no POST /transactions
- **AppModule** — ValidationPipe global, CorrelationIdInterceptor global, PersistenceModule.forRoot()

## Decisões tomadas

- TransactionService usa lock pessimistic (SELECT FOR UPDATE) via repository
- Controllers retornam DTOs tipados, não entities diretamente
- BusinessExceptionFilter mapeia domain errors para códigos HTTP semânticos

## Lições aprendidas

- Repositories customizados estendem EntityRepository do MikroORM
- O `findOneForUpdate` usa `lockMode: 'pessimistic_write'` do MikroORM

## Issues conhecidos

- HealthController ready endpoint retorna placeholder (completado na SPEC-000.4)
- Sem testes de integração HTTP com Supertest

---

## Manual de Execução

### Testar controllers e services

```bash
# Todos os testes de aplicação (services + use cases)
bun test src/application/

# Testes HTTP de integração (requer PostgreSQL)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/http/
```

### Verificar endpoints com curl

```bash
# 1. Health (público)
curl http://localhost:3000/health/live
# → { "status": "ok" }

# 2. Criar wallet (requer autenticação)
curl -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "initialBalance": { "amount": "1000.00", "currency": "BRL" }
  }'
# → 201 { "id": "...", "playerId": "...", "balance": { "amount": "1000.00", "currency": "BRL" }, "version": 1 }

# 3. Consultar wallet
curl http://localhost:3000/wallets/<walletId> \
  -H "Authorization: Bearer <jwt_token>"
# → 200 { "id": "...", "balance": { "amount": "1000.00", "currency": "BRL" }, "version": 1 }

# 4. Submeter transação BET
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: provider-a:tx-123" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "providerId": "provider-a",
    "externalTransactionId": "tx-123",
    "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId": "<walletId>",
    "roundId": "round-987",
    "gameId": "fortune-chimp",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }'
# → 201 { "transactionId": "...", "status": "PROCESSED", "balance": { "amount": "975.00", "currency": "BRL" }, "idempotentReplay": false }

# 5. Reconciliação
curl -X POST http://localhost:3000/wallets/<walletId>/reconciliation \
  -H "Authorization: Bearer <jwt_token>"
# → 200 { "consistent": true, "difference": { "amount": "0.00", "currency": "BRL" }, "checkedEntries": 2 }
```

### Verificar idempotência

```bash
# Enviar a mesma transação novamente (mesmo Idempotency-Key)
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: provider-a:tx-123" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{ ... mesmo payload ... }'
# → 201 { "...", "idempotentReplay": true }  ← replay idempotente

# Enviar com payload diferente (mesma key)
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: provider-a:tx-123" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{ ... payload diferente ... }'
# → 409 Conflict — idempotency key com payload divergente
```
