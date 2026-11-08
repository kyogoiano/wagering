import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import authConfig from './auth.config';

describe('AuthConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env vars
    process.env.KEYCLOAK_ISSUER = undefined;
    process.env.KEYCLOAK_CLIENT_ID = undefined;
    process.env.KEYCLOAK_CLIENT_SECRET = undefined;
    process.env.KEYCLOAK_AUDIENCE = undefined;
    process.env.JWK_CACHE_TTL = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses custom issuer from env var', () => {
    process.env.KEYCLOAK_ISSUER = 'http://custom:9090/auth/realms/test';
    const config = authConfig();
    expect(config.issuer).toBe('http://custom:9090/auth/realms/test');
  });

  it('uses custom client ID from env var', () => {
    process.env.KEYCLOAK_CLIENT_ID = 'custom-client';
    const config = authConfig();
    expect(config.clientId).toBe('custom-client');
  });

  it('uses custom audience from env var', () => {
    process.env.KEYCLOAK_AUDIENCE = 'custom-audience';
    const config = authConfig();
    expect(config.audience).toBe('custom-audience');
  });

  it('uses custom JWK cache TTL from env var', () => {
    process.env.JWK_CACHE_TTL = '7200';
    const config = authConfig();
    expect(config.jwksCacheTtl).toBe(7200);
  });

  it('uses custom clientSecret from env var', () => {
    process.env.KEYCLOAK_CLIENT_SECRET = 'my-secret';
    const config = authConfig();
    expect(config.clientSecret).toBe('my-secret');
  });
});
