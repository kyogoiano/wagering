# Coding Standards — Jungle

## TypeScript

- **Strict mode** — `strict: true` no tsconfig
- **Explicit returns** — sempre declarar tipo de retorno
- **No implicit any** — todos os parâmetros tipados
- **Readonly by default** — usar `readonly` em propriedades imutáveis
- **No unused variables** — `noUnusedLocals: true`

## DDD

- **Aggregates** — classes com estado mutável private e transições explícitas
- **Value Objects** — imutáveis, com equality por valor
- **Factories** — constructor private + factories estáticas (`create`, `from`, `rehydrate`)
- **Domain Errors** — erros específicos por violação de invariante
- **No framework in domain** — domínio puro sem dependências de NestJS ou MikroORM

## Nomenclatura

- **Classes** — PascalCase (`Wallet`, `Money`, `WagerTransaction`)
- **Variáveis/parâmetros** — camelCase (`walletId`, `balanceAmount`)
- **Constants** — UPPER_SNAKE_CASE (`INSUFFICIENT_BALANCE`)
- **Arquivos** — kebab-case (`wallet.aggregate.ts`, `money.value.ts`)
- **Tests** — `.spec.ts` ao lado do arquivo fonte

## Money

- **Decimal para dinheiro** — sempre usar `Decimal` (decimal.js-light)
- **Serialização** — string com escala fixa de 2 casas (`"25.00"`)
- **Imutabilidade** — toda operação retorna nova instância
- **Validação** — rejeitar NaN, Infinity, notação científica, mais de 2 casas

## Estrutura de Pastas

```
src/
├── domain/          # Domain layer (puro)
├── application/     # Application layer (use cases)
├── api/             # API layer (controllers, DTOs)
├── messaging/       # Messaging layer (inbox, outbox, SQS)
└── infrastructure/  # Infrastructure layer (ORM, logger, metrics)
```

## Regras

- Nunca expor estado mutável de aggregates
- Nunca usar `any` — usar `unknown` quando o tipo é desconhecido
- Sempre validar entradas em factories
- Sempre documentar invariantes em comentários
