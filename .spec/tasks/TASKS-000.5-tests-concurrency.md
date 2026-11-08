# TASKS-000.5: Tests & Concurrency

## Tarefas em Ordem TDD

### 1. Ambiente de Testes

- [ ] **T136:** Criar `docker-compose.test.yml` com PostgreSQL e MiniStack
- [ ] **T137:** Implementar `test/integration/setup.ts` com conexão e migrations
- [ ] **T138:** Implementar cleanup entre testes (TRUNCATE)

### 2. Testes Unitários

- [ ] **T139:** Testes para Money — operações e validações
  - Usar `test.each` para validação de entradas inválidas (NaN, Infinity, notação científica, string vazia, mais de 2 casas)
  - Usar `test.each` para operações aritméticas (add, subtract, negate) com múltiplos casos
- [ ] **T140:** Testes para Wallet — invariantes e debit/credit
- [ ] **T141:** Testes para WagerTransaction — transições de estado
  - Usar `describe.each` para kinds com propriedades diferentes (affectsBalance, requiresReference)
  - Usar `test.each` para transições válidas e inválidas de estado
- [ ] **T142:** Testes para WalletLedgerEntry — aritmética e imutabilidade
- [ ] **T143:** Testes para idempotency — hash e conflito de payload
- [ ] **T143.1:** Garantir que todos os testes unitários com ≥3 casos idênticos usem `test.each` ou `describe.each`

### 3. Testes de Integração

- [ ] **T144:** Teste para migrations e constraints
- [ ] **T145:** Teste para atomicidade wallet/ledger/inbox/outbox
- [ ] **T146:** Teste para inbox deduplicação
- [ ] **T147:** Teste para outbox publisher concorrente
- [ ] **T148:** Teste para retry e DLQ
- [ ] **T149:** Teste para crash recovery

### 4. Testes de Concorrência

- [ ] **T150:** Teste — 50 apostas idênticas em paralelo → 1 débito
- [ ] **T151:** Teste — disputa de saldo (2 apostas de 80 BRL, saldo 100 BRL)
- [ ] **T152:** Teste — wallets diferentes em paralelo
- [ ] **T153:** Teste — ≥3 instâncias simultâneas
- [ ] **T154:** Teste — crash após commit e antes do ack
- [ ] **T155:** Teste — dois publishers sobre a mesma outbox
- [ ] **T156:** Teste — referência fora de ordem
- [ ] **T157:** Teste — reinício do serviço com consistência final

### 5. Invariante Final

- [ ] **T158:** Implementar `assertBalanceInvariant()` — wallet.balance == ledger sum
- [ ] **T159:** Executar invariante após cada teste de integração e concorrência
