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

---

## Manual de Execução

### Testar o domínio

```bash
# Todos os testes do domínio (108 testes)
bun test src/domain/

# Testes específicos
bun test src/domain/money/           # Money (46 testes)
bun test src/domain/wallet/          # Wallet (14 testes)
bun test src/domain/transaction/     # WagerTransaction (38 testes)
bun test src/domain/ledger/          # WalletLedgerEntry (10 testes)
```

### Verificar invariantes

Os testes verificam:
- **Money:** imutabilidade, validação de entrada (NaN, Infinity, escala >2), operações aritméticas, comparação, serialização
- **Wallet:** debit/credit gera ledger entry, version incrementa, saldo nunca negativo, rehydrate de estado
- **WagerTransaction:** transições de estado válidas, terminal states imutáveis, affectsBalance, requiresReference, ledgerDirectionFor
- **WalletLedgerEntry:** isBalanced valida balanceBefore ± money === balanceAfter, imutabilidade via Object.freeze

### Cenário: Criar wallet e debitar

```typescript
// 1. Criar wallet com saldo inicial
const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
// → balance = 100.00, version = 1, 1 ledger entry (CREDIT OPENING)

// 2. Debitar (BET)
const result = wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), 'tx1');
// → balance = 75.00, version = 2, 2 ledger entries

// 3. Verificar ledger
wallet.ledger[1].isBalanced() === true
wallet.ledger[1].direction === 'DEBIT'
wallet.ledger[1].balanceBefore.equals(Money.from({ amount: '100.00', currency: 'BRL' }))
wallet.ledger[1].balanceAfter.equals(Money.from({ amount: '75.00', currency: 'BRL' }))
```
