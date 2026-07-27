import path from 'node:path';
import { defineConfig } from 'vitest/config';

const SRC = path.resolve(__dirname, '../../packages');
const DB_SRC = path.resolve(__dirname, '../../packages/db/src');

function alias(pkg: string) {
  return {
    find: new RegExp(`^@cio/${pkg}(/.*)?$`),
    replacement: (_match: string, subpath: string | undefined) => `${SRC}/${pkg}/src${subpath || ''}`
  };
}

export default defineConfig({
  resolve: {
    alias: [
      { find: '@api', replacement: path.resolve(__dirname, 'src') },
      alias('core'),
      alias('utils'),
      alias('db'),
      alias('ai-assistant'),
      alias('analytics'),
      alias('certificates'),
      alias('email'),
      alias('jobs'),
      // TypeScript path alias used inside @cio/db
      { find: /^@db\b/, replacement: DB_SRC }
    ]
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/classroomio_test',
      REDIS_URL: '',
      BETTER_AUTH_SECRET: 'e5afc4ba370cf45e484ea91fb554eb64a4d86294d5f771a3ef659b3ab67ba2e9',
      PRIVATE_SERVER_KEY: 'e5afc4ba370cf45e484ea91fb554eb64a4d86294d5f771a3ef659b3ab67ba2e9',
      NODE_ENV: 'test',
      PUBLIC_SERVER_URL: 'http://localhost:6035',
      TRUSTED_ORIGINS: 'http://localhost:6036',
      SMTP_HOST: '',
      SMTP_PORT: '',
      OBJECT_STORAGE_ENDPOINT: '',
      OBJECT_STORAGE_PUBLIC_ENDPOINT: ''
    },
    // Give integration tests more time — they hit real Postgres
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
