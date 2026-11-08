# Jungle — Distributed Wagering Processor

Serviço financeiro distribuído que processa transações de apostas recebidas de múltiplos provedores de jogos.

## Stack

- **Runtime:** Bun 1.x
- **Linguagem:** TypeScript (strict mode)
- **Framework:** NestJS
- **Banco:** PostgreSQL
- **ORM:** MikroORM
- **Mensageria:** AWS SQS via MiniStack

## Setup

```bash
bun install
```

## Testes

```bash
# Todos os testes
bun test

# Testes de unidade
bun test:unit
```

## Estrutura do Domínio

```
src/domain/
├── money/           # Money value object (imutável, Decimal)
├── wallet/          # Wallet aggregate root (saldo + version)
├── transaction/     # WagerTransaction (estados, kinds, transições)
├── ledger/          # WalletLedgerEntry (imutável, auditável)
├── failure/         # FailureCode taxonomy
└── errors/          # Domain errors
```

## Invariantes

1. Dinheiro nunca usa `number`, `float` ou `double`
2. Saldo nunca fica negativo
3. Toda alteração de saldo tem lançamento correspondente no ledger
4. Operações são idempotentes via `idempotencyKey` persistente
5. Transações processadas são imutáveis (estados terminais)

## Challenge

Veja [Challenge.md](./Challenge.md) para os requisitos completos.
