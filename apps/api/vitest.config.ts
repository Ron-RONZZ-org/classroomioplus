import path from 'node:path';
import { defineConfig } from 'vitest/config';

const SRC = path.resolve(__dirname, '../../packages');

function alias(pkg: string): { find: RegExp; replacement: (...match: string[]) => string } {
  return {
    find: new RegExp(`^@cio/${pkg}(/.*)?$`),
    replacement: (_match: string, subpath: string | undefined) => `${SRC}/${pkg}/src${subpath || ''}`
  };
}

export default defineConfig({
  resolve: {
    alias: [
      { find: '@api', replacement: path.resolve(__dirname, 'src') },
      // pnpm workspace packages — resolve to source so tests work without building dist/
      alias('core'),
      alias('utils'),
      alias('db'),
      alias('ai-assistant'),
      alias('jobs'),
      // TypeScript path alias used inside @cio/db
      { find: /^@db\b/, replacement: path.resolve(__dirname, '../../packages/db/src') }
    ]
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: ['src/__tests__/integration/**', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
});
