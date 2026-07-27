import path from 'node:path';
import { defineConfig } from 'vitest/config';

const SRC = path.resolve(__dirname, '..');

function alias(pkg: string) {
  return {
    find: new RegExp(`^@cio/${pkg}(/.*)?$`),
    replacement: (_match: string, subpath: string | undefined) => `${SRC}/${pkg}/src${subpath || ''}`
  };
}

export default defineConfig({
  resolve: {
    alias: [alias('utils'), alias('question-types')]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
