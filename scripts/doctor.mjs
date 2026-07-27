// scripts/doctor.mjs — node_modules symlink integrity checker
//
// Detects dangling pnpm symlinks (symlinks that point into
// node_modules/.pnpm/ but whose target no longer exists). These cause
// cryptic "Cannot find module" errors at dev/build time.
//
// Usage:
//   node scripts/doctor.mjs        # check only, exit 2 if broken
//   node scripts/doctor.mjs --fix  # auto-repair via pnpm install

import { readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '../../');
const WORKSPACE_DIRS = ['apps', 'packages'];
const FIX_FLAG = process.argv.includes('--fix');

// ── Detection ──────────────────────────────────────────────────────────────

function findBrokenSymlinks() {
  const broken = [];

  for (const dir of WORKSPACE_DIRS) {
    const parentDir = join(REPO_ROOT, dir);
    let entries;
    try {
      entries = readdirSync(parentDir, { withFileTypes: true });
    } catch {
      continue; // directory may not exist
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const nodeModulesPath = join(parentDir, entry.name, 'node_modules');
      let nmEntries;
      try {
        nmEntries = readdirSync(nodeModulesPath, { withFileTypes: true });
      } catch {
        continue; // no node_modules in this workspace member
      }

      for (const nmEntry of nmEntries) {
        if (!nmEntry.isSymbolicLink()) continue;

        const symlinkPath = join(nodeModulesPath, nmEntry.name);
        try {
          realpathSync(symlinkPath);
        } catch (err) {
          if (err.code === 'ENOENT') {
            // Read what the symlink points to for the error message
            const target = lstatSync(symlinkPath, { throwIfNoEntry: false });
            const linkTarget = target?.isSymbolicLink()
              ? relative(REPO_ROOT, symlinkPath) + ' -> (broken target)'
              : relative(REPO_ROOT, symlinkPath) + ' -> (missing)';
            broken.push({
              path: relative(REPO_ROOT, symlinkPath),
              linkTarget
            });
          }
        }
      }
    }
  }

  return broken;
}

// ── Report ─────────────────────────────────────────────────────────────────

function report(broken) {
  if (broken.length === 0) {
    console.log('✔ node_modules symlinks — all intact');
    return;
  }

  console.log(`✘ Found ${broken.length} broken symlink(s):\n`);
  for (const b of broken) {
    console.log(`   ${b.path}`);
  }

  const cmd = 'CI=true pnpm install --frozen-lockfile';
  console.log(`\nFix with:  ${cmd}`);
}

// ── Fix ─────────────────────────────────────────────────────────────────────

function fix() {
  console.log('Running pnpm install to repair symlinks...\n');
  try {
    execSync('CI=true pnpm install --frozen-lockfile', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' }
    });
    console.log('\n✔ Symlinks repaired');
  } catch {
    console.error('\n✘ pnpm install failed');
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const broken = findBrokenSymlinks();
report(broken);

if (broken.length === 0) {
  process.exit(0);
}

if (FIX_FLAG) {
  fix();
  process.exit(1); // 1 = was broken, now fixed
} else {
  process.exit(2); // 2 = still broken, user needs to fix
}
