# SPEC-000.5: Tests & Concurrency

## Visão Geral

Define os requisitos de teste do sistema: testes de unidade, testes de integração com containers reais, e testes de concorrência com paralelismo real.

## Contexto

O challenge exige que a correção financeira seja comprovada por testes, não apenas por inspeção de código. Os testes de integração usam PostgreSQL e MiniStack reais em containers Docker, e os testes de concorrência usam paralelismo real — não mocks sequenciais.

A invariante final de todos os testes é:

```
wallet.balance == saldo reconstruído pelo ledger
```

## Requisitos

### REQ-001: Testes de Unidade

**Descrição:** Testes rápidos e isolados que validam a lógica de domínio sem dependências externas.

**Cobertura Obrigatória:**

| Componente | Cenários |
|------------|----------|
| **Money** | Operações aritméticas, validação de escala, arredondamento, entradas inválidas (NaN, Infinity, notação científica, string vazia, mais de 2 casas), conflito de moeda |
| **Wallet** | Invariantes de saldo, debit/credit, versão, moeda, reidratação, saldo nunca negativo |
| **WagerTransaction** | Transições de estado, kinds, regras de BET/WIN/LOSS/REFUND/ROLLBACK, estados terminais, affectsBalance, requiresReference |
| **WalletLedgerEntry** | Validação de aritmética, isBalanced, imutabilidade |
| **Idempotency** | Key com payload divergente, replay idempotente, hash canônico |

**Critérios de Aceitação:**

- [ ] Money rejeita todas as entradas inválidas listadas
- [ ] Wallet nunca permite saldo negativo
- [ ] Transições de estado inválidas lançam erro
- [ ] Conflito de moeda é detectado
- [ ] Idempotency key com payload diferente é rejeitada

### REQ-001.1: Testes Parametrizados

**Descrição:** Todos os testes de unidade que validam múltiplos casos de entrada idênticos devem usar testes parametrizados via `test.each` e `describe.each` do Bun test runner, similar ao `@ParameterizedTest` do JUnit 5.

**Motivação:** Eliminar código duplicado em suites de teste onde a mesma lógica é verificada contra diferentes conjuntos de dados. Cada caso de teste é reportado individualmente, facilitando a identificação de qual entrada falhou.

**Contrato:**

```typescript
import { test, expect } from 'bun:test';

// --- Array de arrays: Bun espalha os elementos como argumentos posicionais ---
test.each([
  ['25.00', '10.00', '35.00'],
  ['0.00', '0.00', '0.00'],
  ['100.50', '0.50', '101.00'],
])('Money.add(%s, %s) = %s', (a, b, expected) => {
  const moneyA = Money.from({ amount: a, currency: 'BRL' });
  const moneyB = Money.from({ amount: b, currency: 'BRL' });
  expect(moneyA.add(moneyB).toString()).toBe(expected);
});

// --- Array de objetos: Bun passa o objeto como único argumento ---
test.each([
  { input: '25.123', reason: 'mais de 2 casas decimais' },
  { input: '1e2', reason: 'notação científica' },
  { input: '', reason: 'string vazia' },
  { input: 'NaN', reason: 'valor NaN' },
  { input: 'Infinity', reason: 'valor Infinity' },
])('Money.from rejeita $input ($reason)', ({ input, reason }) => {
  expect(() => Money.from({ amount: input, currency: 'BRL' })).toThrow();
});

// --- describe.each para suites inteiras parametrizadas ---
describe.each([
  { kind: 'BET', affectsBalance: true, requiresReference: false },
  { kind: 'WIN', affectsBalance: true, requiresReference: false },
  { kind: 'LOSS', affectsBalance: false, requiresReference: false },
  { kind: 'REFUND', affectsBalance: true, requiresReference: true },
  { kind: 'ROLLBACK', affectsBalance: true, requiresReference: true },
])('WagerTransaction kind: $kind', ({ kind, affectsBalance, requiresReference }) => {
  test('affectsBalance retorna o valor esperado', () => {
    const tx = WagerTransaction.create({ kind, /* ... */ });
    expect(tx.affectsBalance()).toBe(affectsBalance);
  });

  test('requiresReference retorna o valor esperado', () => {
    const tx = WagerTransaction.create({ kind, /* ... */ });
    expect(tx.requiresReference()).toBe(requiresReference);
  });
});
```

**Regras:**

1. **Sempre usar `test.each`** quando um mesmo corpo de teste for executado contra ≥3 conjuntos de dados
2. **Usar array de arrays** quando os argumentos são simples e posicionais (`[a, b, expected]`)
3. **Usar array de objetos** quando os argumentos têm significado nomeado (`{ input, reason }`) — melhora a legibilidade do título via `$prop`
4. **Usar `describe.each`** quando múltiplos testes dentro de um bloco compartilham os mesmos parâmetros
5. **Formatar títulos** com specifiers do `util.format`: `%p` (print), `%s` (string), `%d`/`%i`/`%f` (números), `%j` (JSON), `$prop` (propriedade do objeto)
6. **Qualifiers encadeáveis:** `test.failing.each(...)`, `test.skip.each(...)`, `test.only.each(...)` funcionam como esperado
7. **Cada invocação** é reportada como um teste separado — uma falha não oculta as demais

**Critérios de Aceitação:**

- [ ] Testes de Money usam `test.each` para validação de entradas inválidas
- [ ] Testes de Money usam `test.each` para operações aritméticas (add, subtract, negate)
- [ ] Testes de WagerTransaction usam `describe.each` para kinds com propriedades diferentes
- [ ] Testes de transições de estado usam `test.each` para casos válidos e inválidos
- [ ] Cada caso parametrizado é reportado individualmente no output do test runner
- [ ] Títulos dos testes parametrizados são legíveis e distinguem os casos

### REQ-002: Testes de Integração

**Descrição:** Testes que validam o comportamento do sistema com PostgreSQL e MiniStack reais em containers Docker.

**Ambiente:**

- PostgreSQL em container Docker
- MiniStack (SQS) em container Docker
- Migrations aplicadas automaticamente antes dos testes

**Cenários Obrigatórios:**

| Cenário | Descrição |
|---------|-----------|
| **Migrations** | Migrations e constraints são aplicadas corretamente |
| **Atomicidade** | Wallet, ledger, inbox e outbox são confirmados na mesma transação SQL |
| **Inbox** | Mensagem duplicada é detectada via inbox persistente |
| **Redelivery** | Redelivery após "crash" não duplica efeitos |
| **Outbox** | Publishers concorrentes sobre a mesma outbox não duplicam eventos |
| **Retry** | Retry com backoff exponencial funciona |
| **DLQ** | Mensagem com tentativas esgotadas vai para DLQ |
| **Recuperação** | Após reinicialização, eventos pendentes são publicados |

**Critérios de Aceitação:**

- [ ] Testes usam containers reais, não mocks
- [ ] Atomicidade entre wallet, ledger, inbox e outbox é verificada
- [ ] Inbox previne duplicação após redelivery
- [ ] Outbox publica eventos após crash recovery
- [ ] DLQ recebe mensagens após maxAttempts

### REQ-003: Testes de Concorrência

**Descrição:** Testes que validam a correção financeira sob concorrência real com paralelismo e múltiplos processos.

**Cenários Obrigatórios:**

| Cenário | Descrição |
|---------|-----------|
| **Aposta duplicada** | A mesma aposta enviada 50 vezes em paralelo → um único débito |
| **Disputa de saldo** | Operações concorrentes disputando o saldo da mesma wallet (cenário da seção 8) |
| **Wallets paralelas** | Wallets distintas processadas em paralelo sem bloqueio mútuo |
| **Múltiplas instâncias** | ≥3 processos/instâncias simultâneos |
| **Crash após commit** | Worker morto depois do commit e antes do ack — mensagem é redeliverada sem duplicar |
| **Outbox concorrente** | Dois publishers sobre a mesma outbox não duplicam eventos |
| **Referência fora de ordem** | ROLLBACK ou REFUND entregue antes da referência → PENDING_REFERENCE → processado depois |
| **Reinício do serviço** | Reinício do serviço com comprovação da consistência final |

**Cenário Principal — Disputa de Saldo:**

```
Saldo inicial: 100.00 BRL
Processo A: BET 80.00 BRL
Processo B: BET 80.00 BRL
Ambos executam simultaneamente

Resultado esperado:
- Exatamente 1 PROCESSED
- Exatamente 1 REJECTED (INSUFFICIENT_BALANCE)
- Saldo final: 20.00 BRL
- Exatamente 1 débito no ledger
```

**Critérios de Aceitação:**

- [ ] 50 apostas idênticas em paralelo → 1 débito no ledger
- [ ] Cenário de disputa de saldo funciona 100% das vezes em 100 execuções
- [ ] Wallets diferentes são processadas em paralelo
- [ ] ≥3 instâncias simultâneas
- [ ] Crash após commit não duplica efeitos
- [ ] Referência fora de ordem é resolvida pelo worker
- [ ] Após reinício, `wallet.balance == saldo reconstruído pelo ledger`

### REQ-004: Invariante Final

**Descrição:** Após todos os testes, a invariante fundamental deve ser verificada.

**Verificação:**

```sql
SELECT
  w.id,
  w.balance_amount AS stored_balance,
  COALESCE(SUM(
    CASE
      WHEN l.direction = 'CREDIT' THEN l.amount
      ELSE -l.amount
    END
  ), 0) AS calculated_balance
FROM wallets w
LEFT JOIN wallet_ledger_entries l ON l.wallet_id = w.id
GROUP BY w.id, w.balance_amount
HAVING w.balance_amount != COALESCE(SUM(
    CASE
      WHEN l.direction = 'CREDIT' THEN l.amount
      ELSE -l.amount
    END
  ), 0);
```

**Critérios de Aceitação:**

- [ ] Query retorna 0 linhas após todos os testes
- [ ] Invariante verificada em cada teste de integração e concorrência
- [ ] Teste falha explicitamente se invariante é violada

### REQ-005: Falhas Eliminatórias nos Testes

**Descrição:** Os testes NÃO podem violar as falhas eliminatórias do challenge.

**Regras:**

1. Não substituir completamente PostgreSQL e SQS por mocks nos testes de integração
2. Não usar mocks sequenciais para simular concorrência
3. Os testes de concorrência devem usar paralelismo real

**Critérios de Aceitação:**

- [ ] Testes de integração usam containers reais
- [ ] Testes de concorrência usam paralelismo real
- [ ] Nenhum teste burla as garantias de concorrência

## Restrições

1. Testcontainers ou Docker Compose para PostgreSQL e MiniStack
2. Paralelismo real via workers, processos ou threads
3. Determinismo via seeds onde aplicável

## Dependências

- Todas as specs anteriores

## Referências

- [Challenge.md §13](../Challenge.md#13-testes-obrigatorios) — Testes obrigatórios
- [Challenge.md §8](../Challenge.md#8-concorrencia-e-ordenacao) — Cenário obrigatório de concorrência
