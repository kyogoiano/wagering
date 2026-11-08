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
