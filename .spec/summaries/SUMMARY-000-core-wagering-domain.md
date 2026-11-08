# SUMMARY-000: Core Wagering Domain

## Status

✓ Concluído

## O que foi implementado

- **Money** (`src/domain/money/`) — Value object imutável com Decimal.js; validação de entrada (NaN, Infinity, notação científica, escala >2); operações aritméticas (add, subtract, multiply, divide); comparação; serialização
- **Wallet** (`src/domain/wallet/`) — Aggregate root com debit/credit; gera WalletLedgerEntry; version increment; saldo nunca negativo; rehydrate de estado
- **WagerTransaction** (`src/domain/transaction/`) — Aggregate com state machine (PENDING → PROCESSED/REJECTED/PENDING_REFERENCE); 6 kinds (BET, WIN, LOSS, REFUND, ROLLBACK, OPENING); affectsBalance, requiresReference, ledgerDirectionFor, computePayloadHash (SHA-256)
- **WalletLedgerEntry** (`src/domain/ledger/`) — Entry imutável com validação de balanceamento (isBalanced); directions DEBIT/CREDIT; rehydrate
- **FailureCode** (`src/domain/failure/`) — 17 códigos de falha categorizados como Business/Infrastructure com retriability
- **Domain Errors** (`src/domain/errors/`) — 8 classes: DomainError, InvalidAmountError, InvalidCurrencyError, InsufficientBalanceError, InvalidTransactionStateError, ReferenceNotFoundError, WalletNotFoundError, WalletAlreadyExistsError, IdempotencyConflictError
- **MikroORM Entities** — WalletEntity, WagerTransactionEntity, WalletLedgerEntryEntity com constraints (unique, check, indexes)
- **Migrations SQL** — 3 arquivos: 001 (wallets, wager_transactions, wallet_ledger_entries), 004 (inbox/outbox, pending_reference fields)

## Decisões tomadas

- Money usa `decimal.js` para precisão decimal exata (não float)
- Wallet gera ledger entry IDs como `${walletId}-ledger-${transactionId}` (determinístico)
- WagerTransaction usa SHA-256 para payload hash (canônico, ordena keys)
- Entities usam `@mikro-orm/decorators/legacy` para compatibilidade com Bun
- Constraints autoritativas no banco (CHECK, UNIQUE) garantem invariantes mesmo sem aplicação

## Lições aprendidas

- MikroORM v7 removeu a opção `type` — usar `@mikro-orm/postgresql` diretamente
- `@mikro-orm/core` não exporta `@Entity` em v7 — usar `@mikro-orm/decorators/legacy`
- Testes parametrizados (`it.each`) reduzem drasticamente código duplicado

## Issues conhecidos

- Entities MikroORM não testadas com PostgreSQL real (apenas unit tests)
- Migrations aplicadas manualmente via SQL, não via MikroORM Migrator
