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

---

## Manual de Execução

### Testar migrations e setup de integração

```bash
# Testes de migrations (7 testes — requer PostgreSQL)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/integration/
```

### Testes HTTP de integração

```bash
# Health endpoints (2 testes)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/http/health.e2e.spec.ts

# Wallets CRUD (5 testes)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/http/wallets.e2e.spec.ts

# Wagering transactions (6 testes)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/http/wagering.e2e.spec.ts

# Concorrência real (3 testes)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=jungle_test \
  bun test test/http/concurrency.e2e.spec.ts
```

### Cenário: Disputa de saldo (Challenge.md §8)

O teste `concurrency.e2e.spec.ts` executa:

1. Criar wallet com saldo 100.00 BRL
2. Enviar 2 BETs de 80.00 BRL **simultaneamente** (Promise.all)
3. Verificar que exatamente uma foi PROCESSED e a outra REJECTED
4. Verificar saldo final = 20.00 BRL
5. Verificar exatamente 1 ledger entry DEBIT
6. Verificar invariante: wallet.balance == sum(ledger entries)

### Invariante de saldo

```sql
-- Verificar que o saldo materializado bate com o ledger
SELECT
  w.balance_amount,
  SUM(
    CASE
      WHEN l.direction = 'CREDIT' THEN l.money_amount
      ELSE -l.money_amount
    END
  ) AS calculated_balance
FROM wallets w
JOIN wallet_ledger_entries l ON l.wallet_id = w.id
WHERE w.id = '<walletId>'
GROUP BY w.id, w.balance_amount;
-- balance_amount deve ser igual a calculated_balance
```
