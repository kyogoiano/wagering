# Tasks Template

# TASKS-XXX: [Nome]

## Tarefas em Ordem TDD

### 1. [Componente]

- [ ] **T001:** Escrever testes para [funcionalidade]
  - Quando ≥3 casos idênticos, usar `test.each` ou `describe.each` (testes parametrizados)
- [ ] **T002:** Implementar [funcionalidade]
- [ ] **T003:** Escrever testes para [edge case]

### 2. [Componente]

- [ ] **T004:** Escrever testes para [funcionalidade]
- [ ] **T005:** Implementar [funcionalidade]

## Notas sobre Testes Parametrizados

Use `test.each` e `describe.each` do Bun test runner sempre que um mesmo corpo de teste for executado contra ≥3 conjuntos de dados:

- **Array de arrays** — argumentos posicionais: `test.each([[a, b, expected], ...])('%s + %s = %s', (a, b, expected) => { ... })`
- **Array de objetos** — argumentos nomeados: `test.each([{input, reason}, ...])('rejeita $input ($reason)', ({input}) => { ... })`
- **`describe.each`** — suites inteiras parametrizadas quando múltiplos testes compartilham parâmetros
