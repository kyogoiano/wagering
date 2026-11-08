# PLAN-000.4: Observability & Health

## Visão Geral

Plano de implementação de logs estruturados, métricas e health checks.

## Módulos NestJS

```
src/
└── infrastructure/
    ├── observability/
    │   ├── logging/
    │   │   ├── pino-logger.service.ts
    │   │   ├── pino-logger.module.ts
    │   │   └── correlation-id.middleware.ts
    │   ├── metrics/
    │   │   ├── prometheus-metrics.service.ts
    │   │   ├── prometheus-metrics.module.ts
    │   │   └── metrics.controller.ts
    │   └── health/
    │       ├── health.controller.ts
    │       ├── postgres.health.indicator.ts
    │       └── sqs.health.indicator.ts
```

## Logger — Pino

```typescript
// Configuração do Pino
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { ignore: 'pid,hostname' },
  },
  base: { service: 'jungle-wagering' },
});

// Service injetável
@Injectable()
export class PinoLoggerService implements LoggerService {
  log(message: string, context?: string, metadata?: any) {
    logger.info({ msg: message, context, ...metadata });
  }
  error(message: string, trace?: string, context?: string, metadata?: any) {
    logger.error({ msg: message, trace, context, ...metadata });
  }
  // ...
}
```

## Métricas — Prometheus

```typescript
// Métricas de negócio
const wagerTransactionsTotal = new Counter({
  name: 'wager_transactions_total',
  help: 'Total de transações por status',
  labelNames: ['status', 'kind', 'provider_id'],
});

const wagerDuplicatesTotal = new Counter({
  name: 'wager_duplicates_detected_total',
  help: 'Duplicatas detectadas por idempotency',
});

const wagerOutboxLag = new Gauge({
  name: 'wager_outbox_lag',
  help: 'Eventos pendentes na outbox',
});

const wagerProcessingLatency = new Histogram({
  name: 'wager_processing_latency_seconds',
  help: 'Latência de processamento',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});
```

## Health Checks

```typescript
@Controller('health')
export class HealthController {
  @Get('live')
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  readiness(@Inject(HealthCheck) health: HealthCheckService) {
    return health.check([
      this.postgres.isHealthy(),
      this.sqs.isHealthy(),
    ]);
  }
}
```

## Ordem de Implementação (TDD)

1. Pino logger service com correlationId
2. CorrelationId middleware
3. Prometheus metrics service
4. Metrics controller (/metrics)
5. Health controller (live e ready)
6. PostgreSQL health indicator
7. SQS health indicator
8. Integração com use cases (logs e métricas em cada operação)
