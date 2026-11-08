# Skill: Concurrency Safety

## Descrição

Skill para garantir segurança de concorrência em sistemas financeiros distribuídos com múltiplas instâncias.

## Princípios

1. **Lock por wallet** — A unidade de concorrência é a `walletId`, não global
2. **Pessimistic locking** — `SELECT ... FOR UPDATE` serializa operações na mesma wallet
3. **Idempotência persistente** — Unique constraint no banco, não cache em memória
4. **Constraints autoritativas** — O banco garante as invariantes finais

## Estratégias

- **Pessimistic Locking** — `SELECT ... FOR UPDATE` via MikroORM `LockMode.PESSIMISTIC_WRITE`
- **Optimistic Locking** — `version` column com retry limitado
- **SKIP LOCKED** — `SELECT ... FOR UPDATE SKIP LOCKED` para filas concorrentes

## Armadilhas Comuns

- Read → calculate → update sem lock → lost update
- Lock global → bloqueia wallets diferentes desnecessariamente
- Idempotência em memória → perdida após restart
- Confiar apenas no broker → duplicação se ack falhar
- Deadlock por ordem inconsistente de locks

## Testes de Concorrência

- **Paralelismo real** — Não mocks sequenciais
- **Múltiplas instâncias** — ≥3 processos simultâneos
- **Invariante final** — `wallet.balance == saldo reconstruído pelo ledger`

## Referências

- [SPEC-000.3](../../.spec/SPEC-000.3-concurrency-idempotency.md) — Concurrency & Idempotency
- [ARCH-000](../../.spec/architecture/ARCH-000-distributed-wagering-processor.md) — Estratégia de Concorrência
