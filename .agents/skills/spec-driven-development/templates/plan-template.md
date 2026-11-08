# Plan Template

# PLAN-XXX: [Nome]

## Visão Geral

[Descrição breve do plano]

## Módulos NestJS

```
src/
└── module/
    ├── file.ts
    └── file.spec.ts
```

## Entities MikroORM

```typescript
@Entity()
export class EntityName {
  @PrimaryKey({ type: 'uuid' })
  id: string;
}
```

## Migrations DDL

```sql
CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);
```

## Services

| Service | Responsabilidade |
|---------|-----------------|
| ServiceName | Descrição |

## Ordem de Implementação (TDD)

1. [Tarefa 1]
2. [Tarefa 2]
