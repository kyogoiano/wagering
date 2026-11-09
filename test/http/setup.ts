// test/http/setup.ts
// Shared test setup for HTTP integration tests with Supertest.
// Boots the full NestJS application connected to the PostgreSQL test database.

// Set test DB env vars BEFORE any imports that read them
import { TEST_CONFIG } from '../integration/setup';
process.env.DB_HOST = TEST_CONFIG.host;
process.env.DB_PORT = String(TEST_CONFIG.port);
process.env.DB_USER = TEST_CONFIG.user;
process.env.DB_PASSWORD = TEST_CONFIG.password;
process.env.DB_NAME = TEST_CONFIG.dbName;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Module, ValidationPipe, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import request from 'supertest';
import { PersistenceModule } from '../../src/infrastructure/persistence/persistence.module';
import { LoggingModule } from '../../src/infrastructure/observability/logging/logging.module';
import { MetricsModule } from '../../src/infrastructure/observability/metrics/metrics.module';
import { HealthModule } from '../../src/api/health/health.module';
import { WalletsModule } from '../../src/api/wallets/wallets.module';
import { WageringModule } from '../../src/api/wagering/wagering.module';
import { ReconciliationModule } from '../../src/api/reconciliation/reconciliation.module';
import { SqsModule } from '../../src/infrastructure/messaging/sqs/sqs.module';
import { CorrelationIdInterceptor } from '../../src/api/common/interceptors/correlation-id.interceptor';
import { HttpMetricsMiddleware } from '../../src/infrastructure/observability/metrics/http-metrics.middleware';
import {
  initTestOrm,
  closeTestOrm,
  applyMigrations,
  truncateAll,
} from '../integration/setup';

export interface HttpTestApp {
  app: INestApplication;
  request: typeof request;
}

/**
 * Test AppModule without AuthModule — integration tests run without JWT auth.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // AuthModule intentionally excluded — no auth guards for integration tests
    PersistenceModule.forRoot(),
    LoggingModule.forRoot(),
    MetricsModule.forRoot(),
    HealthModule,
    WalletsModule,
    WageringModule,
    ReconciliationModule,
    SqsModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        disableErrorMessages: false,
      }),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
  ],
})
export class TestAppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

/**
 * Bootstrap the full NestJS application for HTTP integration testing.
 * Uses the test database configured in TEST_CONFIG.
 * Auth guards are disabled to allow testing without JWT tokens.
 */
export async function bootstrapTestApp(): Promise<HttpTestApp> {
  // Ensure test DB is available and migrations are applied
  const orm = await initTestOrm();
  await applyMigrations(orm);
  await orm.close();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  const app = moduleRef.createNestApplication({
    logger: ['error', 'warn'],
  });

  await app.init();

  return { app, request };
}

/**
 * Close the test application and clean up the database.
 */
export async function closeTestApp(httpTestApp: HttpTestApp) {
  await httpTestApp.app.close();
  await closeTestOrm();
}

/**
 * Truncate all tables between tests.
 */
export async function truncateTestTables() {
  const orm = await initTestOrm();
  const em = orm.em.fork();
  await truncateAll(em);
}
