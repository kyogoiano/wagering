# Testing Standards — Jungle

## TDD (Test-Driven Development)

1. **Red** — Escrever teste que falha
2. **Green** — Implementar código mínimo para passar
3. **Refactor** — Melhorar código mantendo testes passando

## Test Triad

| Tipo | Foco | Responsável |
|------|------|-------------|
| Unit | Lógica de domínio isolada | Desenvolvedor |
| Integration | Comportamento com infraestrutura real | Desenvolvedor |
| Concurrency | Correção sob paralelismo real | Desenvolvedor |

## Testes de Unidade

- **Isolados** — sem dependências externas
- **Rápidos** — execução em milissegundos
- **Determinísticos** — mesmo resultado sempre
- **Cobertura** — Money, Wallet, WagerTransaction, Ledger, FailureCode

## Testes Parametrizados

Use `test.each` e `describe.each` do Bun test runner (equivalente a `@ParameterizedTest` do JUnit 5) sempre que um mesmo corpo de teste for executado contra ≥3 conjuntos de dados.

- **`test.each` com array de arrays** — argumentos simples e posicionais: `test.each([[a, b, expected], ...])('%s + %s = %s', (a, b, expected) => { ... })`
- **`test.each` com array de objetos** — argumentos nomeados: `test.each([{input, reason}, ...])('rejeita $input ($reason)', ({input}) => { ... })`
- **`describe.each`** — suites inteiras parametrizadas quando múltiplos testes compartilham os mesmos parâmetros
- **Títulos legíveis** — use specifiers `%p`, `%s`, `%d`, `%j` para arrays e `$prop` para objetos
- **Qualifiers encadeáveis** — `test.failing.each(...)`, `test.skip.each(...)` para tracking de bugs e casos pendentes
- **Cada caso reportado individualmente** — uma falha não oculta as demais

## Testes de Integração

- **Infraestrutura real** — PostgreSQL e MiniStack em containers Docker
- **Migrations** — aplicadas automaticamente antes dos testes
- **Cleanup** — TRUNCATE entre testes
- **Cenários** — atomicidade, inbox, outbox, retry, DLQ, crash recovery

## Testes de Concorrência

- **Paralelismo real** — não mocks sequenciais
- **Múltiplos processos** — ≥3 instâncias simultâneas
- **Cenários obrigatórios**:
  - 50 apostas idênticas em paralelo → 1 débito
  - 2 apostas de 80 BRL com saldo 100 BRL → 1 PROCESSED, 1 REJECTED
  - Wallets diferentes em paralelo sem bloqueio mútuo
- **Invariante final** — `wallet.balance == saldo reconstruído pelo ledger`

## Regras

- **Nunca mockar PostgreSQL ou SQS** em testes de integração
- **Nunca simular concorrência** com mocks sequenciais
- **Sempre verificar invariante** após testes de integração e concorrência
- **Testes falham explicitamente** se invariante é violada

## Ferramentas

- **Bun test** — test runner nativo
- **Docker Compose** — PostgreSQL e MiniStack
- **Assert balance invariant** — query SQL para verificar consistência
