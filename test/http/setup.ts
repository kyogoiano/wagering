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
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app/app.module';
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
 * Bootstrap the full NestJS application for HTTP integration testing.
 * Uses the test database configured in TEST_CONFIG.
 */
export async function bootstrapTestApp(): Promise<HttpTestApp> {
  // Ensure test DB is available and migrations are applied
  const orm = await initTestOrm();
  await applyMigrations(orm);
  await orm.close();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
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
