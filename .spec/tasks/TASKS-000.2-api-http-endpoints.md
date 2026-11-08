# TASKS-000.2: API HTTP Endpoints

## Tarefas em Ordem TDD

### 1. DTOs & Validação

- [ ] **T083:** Criar `CreateWalletDto` com validação
- [ ] **T084:** Criar `SubmitTransactionDto` com validação
- [ ] **T085:** Criar DTOs de resposta (Wallet, Transaction, Ledger, Reconciliation)

### 2. Exception Filters

- [ ] **T086:** Implementar `BusinessExceptionFilter` com mapeamento de status HTTP
- [ ] **T087:** Escrever testes para cada tipo de erro → status HTTP

### 3. Interceptors & Guards

- [ ] **T088:** Implementar `CorrelationIdInterceptor`
- [ ] **T089:** Implementar `IdempotencyKeyGuard`

### 4. Health Controller

- [ ] **T090:** Implementar `GET /health/live`
- [ ] **T091:** Implementar `GET /health/ready` com indicadores PostgreSQL e SQS

### 5. Wallets Controller

- [ ] **T092:** Implementar `POST /wallets` — criar wallet
- [ ] **T093:** Implementar `GET /wallets/:walletId` — consultar wallet
- [ ] **T094:** Implementar `GET /wallets/:walletId/ledger` — ledger com cursor pagination
- [ ] **T095:** Escrever testes de integração para endpoints de wallets

### 6. Wagering Controller

- [ ] **T096:** Implementar `POST /wagering/transactions` — submeter transação
- [ ] **T097:** Implementar `GET /wagering/transactions/:transactionId`
- [ ] **T098:** Implementar `GET /providers/:providerId/wagering/transactions/:externalId`
- [ ] **T099:** Escrever testes de integração para endpoints de transações

### 7. Reconciliation Controller

- [ ] **T100:** Implementar `POST /wallets/:walletId/reconciliation`
- [ ] **T101:** Escrever testes para reconciliação consistente e inconsistente
