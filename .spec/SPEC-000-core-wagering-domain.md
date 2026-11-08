# SPEC-000: Core Wagering Domain

## Visão Geral

Define os modelos de domínio centrais do sistema de processamento de apostas: `Money`, `Wallet`, `WagerTransaction`, `WalletLedgerEntry` e `FailureCode`. Estes modelos formam a base imutável sobre a qual toda a lógica de negócio é construída.

## Contexto

O sistema processa operações de apostas (BET, WIN, LOSS, REFUND, ROLLBACK) recebidas de múltiplos provedores de jogos. Cada operação afeta o saldo de uma wallet e gera lançamentos auditáveis no ledger. O domínio deve garantir que:

- Dinheiro é representado com precisão exata (sem `number`, `float` ou `double`)
- Saldo nunca fica negativo
- Toda alteração de saldo tem lançamento correspondente no ledger
- Operações são idempotentes e imutáveis após processamento

## Requisitos

### REQ-001: Money — Valor Monetário Imutável

**Descrição:** Classe imutável que representa um valor monetário com precisão decimal exata.

**Contrato:**

```typescript
interface MoneyProps {
  amount: string;   // decimal string, ex.: "25.00"
  currency: string; // ISO-4217
}

class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money;
  static zero(currency: string): Money;

  add(other: Money): Money;
  subtract(other: Money): Money;
  negate(): Money;

  isZero(): boolean;
  isPositive(): boolean;
  isNegative(): boolean;
  isLessThan(other: Money): boolean;
  equals(other: Money): boolean;

  toJSON(): MoneyProps;
  toString(): string;

  private assertSameCurrency(other: Money): void;
}
```

**Regras:**

1. `amount` é recebido e serializado como string decimal, sempre com escala fixa de 2 casas
2. Operações entre moedas diferentes lançam erro de domínio
3. Entradas inválidas são rejeitadas: NaN, Infinity, notação científica, string vazia, mais de 2 casas decimais, valores negativos em contratos de entrada
4. O domínio não depende de tipos monetários do ORM nem de decorators do NestJS
5. Na persistência, valor e moeda podem ocupar colunas separadas, desde que a representação seja exata e reidratada como Money
6. Toda operação retorna uma nova instância (imutabilidade)

**Critérios de Aceitação:**

- [ ] `Money.from({amount: "25.00", currency: "BRL"})` cria instância válida
- [ ] `Money.from({amount: "25.123", currency: "BRL"})` lança erro (mais de 2 casas)
- [ ] `Money.from({amount: "1e2", currency: "BRL"})` lança erro (notação científica)
- [ ] `Money.from({amount: "", currency: "BRL"})` lança erro (string vazia)
- [ ] `Money.from({amount: "NaN", currency: "BRL"})` lança erro
- [ ] `Money.from({amount: "Infinity", currency: "BRL"})` lança erro
- [ ] `money.add(other)` com moedas diferentes lança erro
- [ ] `money.subtract(other)` retorna nova instância, não modifica original
- [ ] `Money.zero("BRL")` retorna instância com valor zero
- [ ] `money.toJSON()` retorna `{amount: "25.00", currency: "BRL"}`

### REQ-002: Wallet — Aggregate Root

**Descrição:** Aggregate root que representa a carteira financeira de um jogador, com saldo materializado e ledger interno.

**Contrato:**

```typescript
class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet;

  static rehydrate(state: WalletState): Wallet;

  get balance(): Money { return this._balance; }
  get version(): number { return this._version; }
  get updatedAt(): Date { return this._updatedAt; }

  debit(amount: Money, referenceId: string): WalletLedgerEntry[];
  credit(amount: Money, referenceId: string): WalletLedgerEntry[];

  private assertSameCurrency(money: Money): void;
}
```

**Invariantes:**

1. No máximo uma wallet por `playerId + currency`
2. Saldo nunca negativo
3. Toda alteração de saldo tem um lançamento correspondente no ledger (e vice-versa)
4. Operações concorrentes não podem causar lost update
5. A moeda da operação deve ser igual à moeda da wallet
6. `version` inicia em 1 após a criação e incrementa somente quando o saldo muda

**Critérios de Aceitação:**

- [ ] `Wallet.open()` cria wallet com saldo inicial e version 1
- [ ] `wallet.debit()` reduz saldo e gera lançamento DEBIT no ledger
- [ ] `wallet.credit()` aumenta saldo e gera lançamento CREDIT no ledger
- [ ] `wallet.debit()` com valor maior que saldo lança erro
- [ ] `wallet.debit()` com moeda diferente lança erro
- [ ] `wallet.rehydrate()` reconstrói estado sem revalidar transições
- [ ] Saldo nunca fica negativo após qualquer operação

### REQ-003: WagerTransaction — Transação de Aposta

**Descrição:** Representa uma operação de aposta com estados, kinds e transições válidas.

**Contrato:**

```typescript
enum WagerTransactionKind {
  Opening  = "OPENING",
  Bet      = "BET",
  Win      = "WIN",
  Loss     = "LOSS",
  Refund   = "REFUND",
  Rollback = "ROLLBACK",
}

enum WagerTransactionStatus {
  Pending          = "PENDING",
  PendingReference = "PENDING_REFERENCE",
  Processed        = "PROCESSED",
  Rejected         = "REJECTED",
  Failed           = "FAILED",
}

class WagerTransaction {
  private constructor(/* ... */) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction;
  static rehydrate(state: WagerTransactionState): WagerTransaction;

  get status(): WagerTransactionStatus;
  get referenceTransactionId(): string | undefined;
  get failureCode(): FailureCode | undefined;
  get processedAt(): Date | undefined;

  markProcessed(referenceTransactionId: string | undefined, at: Date): void;
  markPendingReference(): void;
  reject(code: FailureCode): void;
  fail(code: FailureCode): void;

  isTerminal(): boolean;
  affectsBalance(): boolean;
  requiresReference(): boolean;
  matchesPayload(payloadHash: string): boolean;
  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection;
}
```

**Regras de Transição:**

| Estado Atual | Ação | Estado Resultante |
|-------------|------|-------------------|
| PENDING | markProcessed | PROCESSED |
| PENDING | reject | REJECTED |
| PENDING | fail | FAILED |
| PENDING | markPendingReference | PENDING_REFERENCE |
| PENDING_REFERENCE | markProcessed | PROCESSED |
| PENDING_REFERENCE | reject | REJECTED |
| PROCESSED | — | Terminal, sem transição |
| REJECTED | — | Terminal, sem transição |
| FAILED | — | Terminal, sem transição |

**Regras de Negócio por Kind:**

| Kind | Efeito no Saldo | Ledger | Regra Principal |
|------|----------------|--------|----------------|
| BET | débito | 1 DEBIT | Rejeitar se saldo insuficiente |
| WIN | crédito | 1 CREDIT | Pode referenciar BET da rodada |
| LOSS | nenhum | nenhum | Registra resultado sem mover saldo |
| REFUND | crédito | 1 CREDIT | Reverte BET PROCESSED, uma vez |
| ROLLBACK | inverso | 1 invertida | Reverte transação PROCESSED, uma vez |

**Critérios de Aceitação:**

- [ ] Transação nasce em PENDING
- [ ] PROCESSED, REJECTED, FAILED são estados terminais
- [ ] Tentar transicionar estado terminal lança erro
- [ ] `affectsBalance()` retorna false para LOSS
- [ ] `requiresReference()` retorna true para REFUND e ROLLBACK
- [ ] OPENING é interno, não pode ser submetido pela API

### REQ-004: WalletLedgerEntry — Lançamento Imutável

**Descrição:** Registro imutável no ledger que documenta cada alteração de saldo.

**Contrato:**

```typescript
enum LedgerDirection { Debit = "DEBIT", Credit = "CREDIT" }

class WalletLedgerEntry {
  private constructor(/* ... */) {}

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry;
  static rehydrate(state: LedgerEntryState): WalletLedgerEntry;

  isBalanced(): boolean;
}
```

**Regras:**

1. Sem campos mutáveis e sem métodos de transição — imutabilidade estrutural
2. `create` valida a aritmética: `balanceBefore ± money === balanceAfter`
3. Uma transação financeira produz no máximo um lançamento por wallet
4. Operações sem efeito no saldo (LOSS, REJECTED) não geram lançamento

**Critérios de Aceitação:**

- [ ] `isBalanced()` retorna true se `balanceBefore ± money === balanceAfter`
- [ ] `create()` lança erro se aritmética não bate
- [ ] Instância é imutável após criação
- [ ] LOSS não gera lançamento

### REQ-005: FailureCode — Taxonomia de Falhas

**Descrição:** Códigos de falha estáveis e legíveis por máquina para rejeições.

**Taxonomia Proposta:**

| Código | Categoria | Descrição | Retriável? |
|--------|-----------|-----------|-----------|
| `INSUFFICIENT_BALANCE` | Business | Saldo insuficiente para débito | Não |
| `INVALID_CURRENCY` | Business | Moeda incompatível com wallet | Não |
| `INVALID_AMOUNT` | Business | Valor inválido (negativo, escala) | Não |
| `REFERENCE_NOT_FOUND` | Business | Referência externa não encontrada | Sim (pending) |
| `REFERENCE_ALREADY_REVERSED` | Business | Referência já revertida pelo mesmo tipo | Não |
| `REFERENCE_INVALID_KIND` | Business | Referência com kind incompatível | Não |
| `REFERENCE_MISMATCH` | Business | Referência não pertence ao mesmo player/wallet/rodada | Não |
| `IDEMPOTENCY_CONFLICT` | Business | Mesma key com payload diferente | Não |
| `WALLET_NOT_FOUND` | Business | Wallet não existe | Não |
| `WALLET_ALREADY_EXISTS` | Business | Wallet duplicada para playerId+currency | Não |
| `INVALID_TRANSACTION_KIND` | Business | Kind de transação inválido | Não |
| `REFERENCE_VALUE_MISMATCH` | Business | Valor de REFUND/ROLLBACK diferente da referência | Não |
| `REVERSAL_WOULD_NEGATIVE_BALANCE` | Business | Reversão produziria saldo negativo | Não |
| `INFRASTRUCTURE_ERROR` | Infrastructure | Erro transitório de infraestrutura | Sim |
| `DATABASE_ERROR` | Infrastructure | Erro de banco de dados | Sim |
| `MESSAGE_SERIALIZATION_ERROR` | Infrastructure | Erro de serialização de mensagem | Não |

**Critérios de Aceitação:**

- [ ] Cada código é único e estável
- [ ] Códigos de business não são retried
- [ ] Códigos de infraestrutura podem ser retried
- [ ] `REFERENCE_NOT_FOUND` leva a PENDING_REFERENCE, não REJECTED imediato

## Restrições

1. Não usar `number`, `float` ou `double` para dinheiro
2. Não sobrescrever nem excluir lançamentos do ledger
3. Garantias de unicidade, imutabilidade e não-negatividade aplicadas no schema do banco
4. Construtor private/protected + factories estáticas (create, from, rehydrate)

## Dependências

- Nenhuma (base de todas as outras specs)

## Referências

- [Challenge.md §6](../Challenge.md#6-modelo-de-domínio) — Modelo de domínio
- [Challenge.md §7](../Challenge.md#7-regras-de-negocio) — Regras de negócio
- [Challenge.md §7.2](../Challenge.md#72-codigos-de-falha) — Códigos de falha
