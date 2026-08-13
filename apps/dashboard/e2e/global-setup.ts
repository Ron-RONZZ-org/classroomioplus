import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Global setup for the E2E suite.
 *
 * Resets and re-seeds the database so every E2E run starts from the exact
 * seeded state. Without this, runs drift the local dev DB: prior tests
 * rename seeded orgs ("Udemy Test [E2E 1785...]"), enroll users across
 * tenants, or change roles — which then breaks later runs and manual dev
 * (e.g. admin@test.com suddenly counting as a student).
 *
 * Contract:
 *   - Local runs reset + re-seed the database the local API points to
 *     (`DATABASE_URL` in `packages/db/.env`). Start the dev stack first,
 *     then run the suite — the API keeps working across the reset.
 *   - CI is unaffected: the `ci.yml` e2e job spins up a fresh Postgres
 *     service and seeds it itself; this setup skips because `CI` is set.
 *
 * Opt out (debug against existing data): E2E_SKIP_DB_RESET=1
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.CI || process.env.E2E_SKIP_DB_RESET) {
    console.log('[e2e] skipping DB reset (CI or E2E_SKIP_DB_RESET is set)');
    return;
  }

  // apps/dashboard/e2e -> apps/dashboard -> apps -> repo root
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

  console.log('[e2e] resetting database (pnpm --filter @cio/db db:reset)...');
  await runPnpm(repoRoot, ['--filter', '@cio/db', 'db:reset']);
  console.log('[e2e] re-seeding database (pnpm --filter @cio/db db:setup:seed)...');
  await runPnpm(repoRoot, ['--filter', '@cio/db', 'db:setup:seed']);
  console.log('[e2e] database reset complete — starting tests on fresh seeded data');
}

function runPnpm(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('pnpm', args, { cwd, stdio: 'inherit', env: process.env });

    child.on('error', (error) => rejectPromise(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`pnpm ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}
