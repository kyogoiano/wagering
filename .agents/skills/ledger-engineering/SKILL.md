# Skill: Ledger Engineering

## Descrição

Skill para engenharia de ledger financeiro com precisão exata e consistência garantida.

## Princípios

1. **Precisão exata** — Nunca usar `number` para dinheiro. Sempre usar `Decimal`.
2. **Imutabilidade** — Lançamentos no ledger nunca são alterados ou excluídos.
3. **Consistência** — Toda alteração de saldo gera exatamente um lançamento na mesma transação SQL.
4. **Auditabilidade** — O ledger permite reconstruir o saldo a qualquer momento.

## Padrões

- **Single-entry ledger** — Cada transação gera no máximo um lançamento por wallet
- **Direction** — DEBIT (reduz saldo) ou CREDIT (aumenta saldo)
- **Balance tracking** — Cada lançamento registra balanceBefore e balanceAfter
- **Validation** — `balanceBefore ± money === balanceAfter` validado na factory

## Armadilhas Comuns

- Usar `number` para cálculos monetários → perda de precisão
- Esquecer de gerar lançamento para uma alteração de saldo → inconsistência
- Permitir UPDATE/DELETE no ledger → perda de auditabilidade
- Não validar a aritmética do lançamento → saldo incorreto

## Referências

- [SPEC-000](../../.spec/SPEC-000-core-wagering-domain.md) — REQ-004: WalletLedgerEntry
- [ARCH-000](../../.spec/architecture/ARCH-000-distributed-wagering-processor.md) — Schema PostgreSQL
