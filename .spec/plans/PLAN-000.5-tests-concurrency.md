# PLAN-000.5: Tests & Concurrency

## Visão Geral

Plano de implementação dos testes de unidade, integração e concorrência.

## Estrutura de Testes

```
test/
├── unit/
│   ├── money.spec.ts
│   ├── wallet.spec.ts
│   ├── wager-transaction.spec.ts
│   ├── wallet-ledger-entry.spec.ts
│   └── idempotency.spec.ts
├── integration/
│   ├── setup.ts
│   ├── migrations.spec.ts
│   ├── atomicity.spec.ts
│   ├── inbox-deduplication.spec.ts
│   ├── outbox-publisher.spec.ts
│   ├── retry-dlq.spec.ts
│   └── crash-recovery.spec.ts
└── concurrency/
    ├── duplicate-bet.spec.ts
    ├── balance-dispute.spec.ts
    ├── parallel-wallets.spec.ts
    ├── multi-instance.spec.ts
    ├── crash-after-commit.spec.ts
    ├── concurrent-outbox.spec.ts
    ├── out-of-order-reference.spec.ts
    └── service-restart.spec.ts
```

## Ambiente de Testes

### Docker Compose para Testes

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: jungle_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U test']
      interval: 5s
      timeout: 5s
      retries: 5

  minystack:
    image: softwaremill/minystack:0.7.0
    ports:
      - '9000:9000'
```

### Setup de Testes

```typescript
// test/integration/setup.ts
beforeAll(async () => {
  // Conectar ao PostgreSQL de teste
  await MikroORM.init({
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    user: 'test',
    password: 'test',
    dbName: 'jungle_test',
  });
  
  // Aplicar migrations
  await orm.getMigrator().up();
});

beforeEach(async () => {
  // Limpar dados entre testes
  await orm.getEntityManager().transactional(async (em) => {
    await em.execute('TRUNCATE wallet_ledger_entries RESTART IDENTITY CASCADE');
    await em.execute('TRUNCATE wager_transactions RESTART IDENTITY CASCADE');
    await em.execute('TRUNCATE wallets RESTART IDENTITY CASCADE');
    await em.execute('TRUNCATE inbox_messages RESTART IDENTITY CASCADE');
    await em.execute('TRUNCATE outbox_messages RESTART IDENTITY CASCADE');
  });
});
```

## Testes Parametrizados

### `test.each` — Array de Arrays

Quando os argumentos são simples e posicionais, use array de arrays. Bun espalha os elementos como argumentos da função:

```typescript
import { test, expect } from 'bun:test';
import { Money } from '../../src/domain/money';

test.each([
  ['25.00', '10.00', '35.00'],
  ['0.00', '0.00', '0.00'],
  ['100.50', '0.50', '101.00'],
  ['50.00', '50.00', '100.00'],
])('Money.add(%s, %s) = %s', (a, b, expected) => {
  const moneyA = Money.from({ amount: a, currency: 'BRL' });
  const moneyB = Money.from({ amount: b, currency: 'BRL' });
  expect(moneyA.add(moneyB).toString()).toBe(expected);
});
```

### `test.each` — Array de Objetos

Quando os argumentos têm significado nomeado, use array de objetos. Acesse as propriedades via `$prop` no título:

```typescript
test.each([
  { input: '25.123', reason: 'mais de 2 casas decimais' },
  { input: '1e2', reason: 'notação científica' },
  { input: '', reason: 'string vazia' },
  { input: 'NaN', reason: 'valor NaN' },
  { input: 'Infinity', reason: 'valor Infinity' },
  { input: '-5.00', reason: 'valor negativo em entrada' },
])('Money.from rejeita $input ($reason)', ({ input }) => {
  expect(() => Money.from({ amount: input, currency: 'BRL' })).toThrow();
});
```

### `describe.each` — Suites Parametrizadas

Quando múltiplos testes dentro de um bloco compartilham os mesmos parâmetros:

```typescript
import { describe, test, expect } from 'bun:test';
import { WagerTransaction, WagerTransactionKind } from '../../src/domain/wager-transaction';

describe.each([
  { kind: WagerTransactionKind.Bet, affectsBalance: true, requiresReference: false },
  { kind: WagerTransactionKind.Win, affectsBalance: true, requiresReference: false },
  { kind: WagerTransactionKind.Loss, affectsBalance: false, requiresReference: false },
  { kind: WagerTransactionKind.Refund, affectsBalance: true, requiresReference: true },
  { kind: WagerTransactionKind.Rollback, affectsBalance: true, requiresReference: true },
])('WagerTransaction kind: $kind', ({ kind, affectsBalance, requiresReference }) => {
  const createTx = () => WagerTransaction.create({
    id: 'tx-1',
    walletId: 'w-1',
    providerId: 'provider-a',
    externalTransactionId: 'ext-1',
    kind,
    amount: Money.from({ amount: '25.00', currency: 'BRL' }),
    idempotencyKey: `provider-a:ext-1`,
  });

  test('affectsBalance retorna o valor esperado', () => {
    expect(createTx().affectsBalance()).toBe(affectsBalance);
  });

  test('requiresReference retorna o valor esperado', () => {
    expect(createTx().requiresReference()).toBe(requiresReference);
  });
});
```

### Title Format Specifiers

| Specifier | Descrição | Exemplo |
|-----------|-----------|---------|
| `%p` | `util.inspect` do valor | `%p` → `['a', 'b']` |
| `%s` | String | `%s` → `hello` |
| `%d` / `%i` / `%f` | Número | `%d` → `42` |
| `%j` | JSON | `%j` → `{"a":1}` |
| `$prop` | Propriedade do objeto row | `$kind` → `BET` |
| `$#` | Índice do test case | `$#` → `0` |

### Qualifiers Encadeáveis

```typescript
// Testes parametrizados que devem falhar (tracking de bugs conhecidos)
test.failing.each([
  ['case-1'],
  ['case-2'],
])('known failing case %s', (input) => {
  // ...
});

// Skip condicional
test.skip.each([
  ['case-1'],
])('skipped case %s', (input) => {
  // ...
});
```

## Testes de Concorrência

### Cenário — Disputa de Saldo

```typescript
// test/concurrency/balance-dispute.spec.ts
it('should process exactly one bet when two compete for balance', async () => {
  // Criar wallet com saldo 100.00
  const wallet = await createWallet({ initialBalance: '100.00' });
  
  // Enviar 2 apostas de 80.00 simultaneamente
  const [resultA, resultB] = await Promise.all([
    submitTransaction({ walletId: wallet.id, kind: 'BET', amount: '80.00' }),
    submitTransaction({ walletId: wallet.id, kind: 'BET', amount: '80.00' }),
  ]);
  
  // Verificar resultado
  const results = [resultA, resultB];
  expect(results.filter(r => r.status === 'PROCESSED')).toHaveLength(1);
  expect(results.filter(r => r.status === 'REJECTED')).toHaveLength(1);
  
  // Verificar saldo final
  const finalWallet = await getWallet(wallet.id);
  expect(finalWallet.balance.amount).toBe('20.00');
  
  // Verificar ledger
  const ledgerEntries = await getLedger(wallet.id);
  expect(ledgerEntries.filter(e => e.direction === 'DEBIT')).toHaveLength(1);
  
  // Verificar invariante
  await assertBalanceInvariant(wallet.id);
});
```

### Cenário — 50 Apostas Idênticas

```typescript
it('should process exactly one debit when 50 identical bets are sent in parallel', async () => {
  const wallet = await createWallet({ initialBalance: '1000.00' });
  
  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      submitTransaction({
        walletId: wallet.id,
        kind: 'BET',
        amount: '25.00',
        idempotencyKey: 'provider-a:same-bet',
      })
    )
  );
  
  // Todas devem retornar o mesmo resultado
  const processed = results.filter(r => r.status === 'PROCESSED');
  expect(processed).toHaveLength(1);
  
  // Apenas 1 débito no ledger
  const ledgerEntries = await getLedger(wallet.id);
  expect(ledgerEntries.filter(e => e.direction === 'DEBIT')).toHaveLength(1);
});
```

## Invariante Final

```typescript
// Verificar que wallet.balance == saldo reconstruído pelo ledger
async function assertBalanceInvariant(walletId: string) {
  const result = await orm.getEntityManager().execute(`
    SELECT
      w.balance_amount AS stored_balance,
      COALESCE(SUM(
        CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END
      ), 0) AS calculated_balance
    FROM wallets w
    LEFT JOIN wallet_ledger_entries l ON l.wallet_id = w.id
    WHERE w.id = $1
    GROUP BY w.id, w.balance_amount
  `, [walletId]);
  
  expect(result[0].stored_balance.toString()).toBe(result[0].calculated_balance.toString());
}
```

## Ordem de Implementação (TDD)

1. Testes unitários do domínio (Money, Wallet, Transaction, Ledger)
2. Setup de integração com Docker Compose
3. Testes de migrations e constraints
4. Testes de atomicidade wallet/ledger/inbox/outbox
5. Testes de inbox deduplicação
6. Testes de outbox publisher concorrente
7. Testes de retry e DLQ
8. Testes de concorrência real (balance dispute, duplicate bets)
9. Testes de múltiplas instâncias
10. Teste de crash recovery
11. Teste de invariante final
