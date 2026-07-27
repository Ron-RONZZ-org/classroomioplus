import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = path.resolve(__dirname, 'src');
const PARENT = path.resolve(__dirname, '../..');

function cioAlias(pkg: string) {
  return {
    find: new RegExp(`^@cio/${pkg}(/.*)?$`),
    replacement: (_match: string, subpath: string | undefined) => `${PARENT}/packages/${pkg}/src${subpath || ''}`
  };
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: [
      // SvelteKit path aliases (mirrored from svelte.config.js)
      { find: '$lib', replacement: path.resolve(SRC, 'lib') },
      { find: '$features', replacement: path.resolve(SRC, 'lib/features') },
      { find: '$mail', replacement: path.resolve(SRC, 'mail') },
      // pnpm workspace packages — resolve to source for testing
      cioAlias('utils'),
      cioAlias('core'),
      cioAlias('db'),
      cioAlias('ai-assistant'),
      cioAlias('ui'),
      cioAlias('jobs'),
      cioAlias('question-types')
    ]
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}']
  }
});
