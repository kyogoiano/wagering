# TASKS-000: Core Wagering Domain

## Tarefas em Ordem TDD

### 1. Money Value Object

- [ ] **T001:** Escrever testes para `Money.from()` — entradas válidas
- [ ] **T002:** Escrever testes para `Money.from()` — entradas inválidas (NaN, Infinity, notação científica, string vazia, mais de 2 casas)
- [ ] **T003:** Implementar `Money` class com constructor private e factory `from()`
- [ ] **T004:** Escrever testes para operações aritméticas (add, subtract, negate)
- [ ] **T005:** Implementar operações aritméticas retornando nova instância
- [ ] **T006:** Escrever testes para comparação (isZero, isPositive, isNegative, isLessThan, equals)
- [ ] **T007:** Implementar métodos de comparação
- [ ] **T008:** Escrever testes para conflito de moeda
- [ ] **T009:** Implementar `assertSameCurrency()`
- [ ] **T010:** Escrever testes para serialização (toJSON, toString)
- [ ] **T011:** Implementar `toJSON()` e `toString()`
- [ ] **T012:** Implementar `Money.zero(currency)`

### 2. FailureCode Taxonomy

- [ ] **T013:** Definir enum/const com todos os FailureCodes
- [ ] **T014:** Documentar cada código com categoria e retriability

### 3. WalletLedgerEntry

- [ ] **T015:** Escrever testes para `WalletLedgerEntry.create()` — aritmética válida
- [ ] **T016:** Escrever testes para `WalletLedgerEntry.create()` — aritmética inválida
- [ ] **T017:** Implementar `WalletLedgerEntry` com factory `create()` e `isBalanced()`
- [ ] **T018:** Escrever testes para imutabilidade
- [ ] **T019:** Implementar `rehydrate()`

### 4. Wallet Aggregate

- [ ] **T020:** Escrever testes para `Wallet.open()` — criação com saldo inicial
- [ ] **T021:** Implementar `Wallet.open()` factory
- [ ] **T022:** Escrever testes para `wallet.debit()` — sucesso e falha (saldo insuficiente)
- [ ] **T023:** Implementar `debit()` com geração de ledger entry
- [ ] **T024:** Escrever testes para `wallet.credit()` — sucesso
- [ ] **T025:** Implementar `credit()` com geração de ledger entry
- [ ] **T026:** Escrever testes para conflito de moeda
- [ ] **T027:** Implementar `assertSameCurrency()`
- [ ] **T028:** Escrever testes para version increment
- [ ] **T029:** Implementar version increment em debit/credit
- [ ] **T030:** Implementar `rehydrate()`

### 5. WagerTransaction

- [ ] **T031:** Escrever testes para `WagerTransaction.create()` — todos os kinds
- [ ] **T032:** Implementar `WagerTransaction.create()` com validação de referência
- [ ] **T033:** Escrever testes para transições de estado válidas
- [ ] **T034:** Escrever testes para transições de estado inválidas (terminal)
- [ ] **T035:** Implementar transições (markProcessed, reject, fail, markPendingReference)
- [ ] **T036:** Escrever testes para `affectsBalance()` e `requiresReference()`
- [ ] **T037:** Implementar métodos de consulta
- [ ] **T038:** Implementar `rehydrate()`

### 6. Entities MikroORM

- [ ] **T039:** Criar `WalletEntity` com decorators MikroORM
- [ ] **T040:** Criar `WagerTransactionEntity` com decorators MikroORM
- [ ] **T041:** Criar `WalletLedgerEntryEntity` com decorators MikroORM
- [ ] **T042:** Configurar constraints (unique, check) nas entities

### 7. Repositórios

- [ ] **T043:** Implementar `WalletRepository` com métodos de consulta
- [ ] **T044:** Implementar `WagerTransactionRepository` com métodos de consulta
- [ ] **T045:** Implementar `LedgerRepository` com paginação por cursor

### 8. Migrations

- [ ] **T046:** Criar migration `001_create_wallets.sql`
- [ ] **T047:** Criar migration `002_create_wager_transactions.sql`
- [ ] **T048:** Criar migration `003_create_wallet_ledger_entries.sql`
- [ ] **T049:** Verificar migrations com PostgreSQL real

### 9. Services

- [ ] **T050:** Implementar `WalletService` — criar e consultar wallets
- [ ] **T051:** Implementar `WagerTransactionService` — criar e consultar transações
- [ ] **T052:** Implementar `LedgerService` — consultar ledger e reconciliar
