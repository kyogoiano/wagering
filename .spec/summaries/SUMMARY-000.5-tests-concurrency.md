# SUMMARY-000.5: Tests & Concurrency

## Status

⏳ Parcial — migrations test concluído, testes de concorrência pendentes

## O que foi implementado

- **Setup de testes** (`test/integration/setup.ts`) — Conexão com PostgreSQL via MikroORM v7; applyMigrations com SQL raw; truncateAll; assertBalanceInvariant; assertGlobalBalanceInvariant
- **Migrations test** (`test/integration/migrations.spec.ts`) — 7 testes: tabelas criadas, constraints (balance >= 0, unique wallet, unique idempotency_key, ledger direction), pending_reference fields, invariante global
- **Docker infrastructure** — PostgreSQL (pgvector:pg18) e MiniStack já rodando em containers

## Decisões tomadas

- Testes de integração usam MikroORM v7 com `@mikro-orm/postgresql` diretamente
- Migrations aplicadas via SQL raw (em.execute) em vez do MikroORM Migrator
- Invariante de saldo verificada por query SQL direta

## Lições aprendidas

- MikroORM v7 removeu `type` option, `persistAndFlush`, e `getConnection()` — API mudou significativamente
- `em.execute()` dentro de `em.transactional()` com entities registradas pode conflitar com Kysely parameterization
- Testes de concorrência com raw SQL + pessimistic lock são complexos com MikroORM v7

## Issues conhecidos

- Testes de atomicidade e concorrência (balance dispute, parallel wallets, out-of-order reference) não foram implementados devido a incompatibilidade da API MikroORM v7 com raw SQL em transações
- Os testes de concorrência real exigem que a aplicação seja testada via HTTP endpoints com múltiplos processos, não apenas via EntityManager
- Recomenda-se implementar testes de concorrência via Supertest com a aplicação NestJS rodando, em vez de testes diretos do EntityManager
