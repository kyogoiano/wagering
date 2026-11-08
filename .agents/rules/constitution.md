# Constitution — Invariantes do Projeto Jungle

## Invariantes Financeiras

1. **Dinheiro com precisão exata** — Nunca usar `number`, `float` ou `double` para representar dinheiro. Sempre usar `Decimal` com serialização como string.
2. **Saldo nunca negativo** — O saldo de uma wallet nunca pode ficar negativo, nem mesmo momentaneamente durante uma operação concorrente.
3. **Consistência saldo/ledger** — Toda alteração de saldo gera exatamente um lançamento no ledger na mesma transação SQL. O saldo materializado deve sempre ser igual à soma dos lançamentos.
4. **Imutabilidade do ledger** — Lançamentos no ledger nunca são alterados ou excluídos. Apenas INSERT.
5. **Idempotência persistente** — A mesma operação submetida múltiplas vezes produz o mesmo efeito exatamente uma vez. A garantia é persistente, não em memória.
6. **Atomicidade transacional** — Wallet, ledger, inbox e outbox são confirmados na mesma transação SQL. Ou tudo é commitado, ou nada.

## Invariantes de Engenharia

1. **Correção sob concorrência** — A solução deve estar correta com múltiplas instâncias da aplicação processando a mesma wallet simultaneamente.
2. **Lock por wallet** — A unidade de concorrência é a `walletId`. Não usar lock global.
3. **Eventos após commit** — Eventos de integração nunca são publicados antes do commit da transação financeira.
4. **Ack após commit** — Mensagens SQS são acked somente após o commit da transação SQL.
5. **Constraints no banco** — As garantias de unicidade, imutabilidade e não-negatividade são aplicadas no schema do banco, não apenas em código.
6. **Testes com infraestrutura real** — Testes de integração usam PostgreSQL e SQS reais, não mocks. Testes de concorrência usam paralelismo real.

## Princípios de Modelagem

1. **DDD Tático** — Aggregates, Value Objects, Domain Events, Repositories.
2. **Imutabilidade** — Value Objects e entidades de ledger são imutáveis.
3. **Factories** — Construtor private/protected + factories estáticas (create, from, rehydrate).
4. **Encapsulamento** — Estado mutável é private; transições são métodos explícitos.
