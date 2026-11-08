// test/http/health.e2e.spec.ts
// Integration tests for health endpoints via HTTP.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { bootstrapTestApp, closeTestApp, HttpTestApp } from './setup';

describe('Health Endpoints', () => {
  let httpTestApp: HttpTestApp;

  beforeAll(async () => {
    httpTestApp = await bootstrapTestApp();
  });

  afterAll(async () => {
    await closeTestApp(httpTestApp);
  });

  it('GET /health/live returns 200 ok', async () => {
    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 503 when SQS is not configured', async () => {
    const res = await httpTestApp.request(httpTestApp.app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(res.body.status).toBe('error');
    // SQS health indicator fails when no SQS_URL is configured
    expect(res.body.errors).toBeDefined();
  });
});
