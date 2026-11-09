import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/auth/realms/jungle',
  internalUrl: process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_ISSUER?.replace('/auth/realms/jungle', '') || 'http://localhost:8080',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'jungle-api',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  audience: process.env.KEYCLOAK_AUDIENCE || 'jungle-api',
  jwksCacheTtl: parseInt(process.env.JWK_CACHE_TTL || '3600', 10),
}));
