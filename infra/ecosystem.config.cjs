// PM2 ecosystem config — LibreClassroom Node processes.
//
// Three processes managed natively on the VPS:
//   cio-api        @ 3081   Hono API server
//   cio-dashboard  @ 3082   SvelteKit SSR dashboard
//   cio-jobs                BullMQ worker (media, email, AI generation)
//
// MinIO remains in Docker (infra/minio-compose.yaml) — upstream infrastructure
// that rarely changes. Postgres and Redis can be native, managed, or Docker.
//
// Usage:
//   pm2 startOrReload infra/ecosystem.config.cjs --env production
//   pm2 ls
//   pm2 logs cio-api | cio-dashboard | cio-jobs
//
// Each process loads its own .env via dotenv from its cwd:
//   apps/api/.env       (API)
//   apps/dashboard/.env  (dashboard)
//   apps/jobs/.env       (symlink → ../api/.env)
// This file only sets NODE_ENV and PORT; everything else comes from .env.

const APP_DIR = '/var/www/classroomio';

// ── Auto-scaling memory limits ─────────────────────────────────────────────
// Caps are tuned to leave room for Postgres, Redis, MinIO, and other services
// on a shared VPS. Heuristics are conservative — they assume co-tenants.
// Hard override via CIO_*_MEM env vars if the auto-detection doesn't suit you.
const os = require('os');

// Use explicit env override when set, otherwise detect from total RAM.
const totalGB = os.totalmem() / 1024 / 1024 / 1024;

const caps = {
  api:
    process.env.CIO_API_MEM ||
    (totalGB >= 14 ? '2G' : totalGB >= 7 ? '1G' : totalGB >= 3.5 ? '450M' : /* 2 GB fallback */ '256M'),
  apiHeap: +(process.env.CIO_API_HEAP || (totalGB >= 14 ? 1536 : totalGB >= 7 ? 768 : totalGB >= 3.5 ? 384 : 192)),
  dash:
    process.env.CIO_DASHBOARD_MEM || (totalGB >= 14 ? '2G' : totalGB >= 7 ? '1G' : totalGB >= 3.5 ? '450M' : '256M'),
  dashHeap: +(
    process.env.CIO_DASHBOARD_HEAP || (totalGB >= 14 ? 1536 : totalGB >= 7 ? 768 : totalGB >= 3.5 ? 384 : 192)
  ),
  jobs: process.env.CIO_JOBS_MEM || (totalGB >= 14 ? '3G' : totalGB >= 7 ? '1.5G' : totalGB >= 3.5 ? '600M' : '384M'),
  jobsHeap: +(process.env.CIO_JOBS_HEAP || (totalGB >= 14 ? 2048 : totalGB >= 7 ? 1024 : totalGB >= 3.5 ? 384 : 256))
};

// Preload dotenv so every process reads its own .env automatically.
// The dashboard (adapter-node) and jobs worker do not load .env on their own;
// dotenv/config reads the .env file from the current working directory.
// The API already does `import 'dotenv/config'` in its source, but including
// it here is idempotent and keeps configuration uniform.
const nodeArgs = (heap) => `--max-old-space-size=${heap} -r dotenv/config`;

module.exports = {
  apps: [
    {
      name: 'cio-api',
      cwd: `${APP_DIR}/apps/api`,
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      node_args: nodeArgs(caps.apiHeap),
      max_memory_restart: caps.api,
      autorestart: true,
      watch: false,
      kill_timeout: 10000,
      out_file: '/var/log/classroomio/api-out.log',
      error_file: '/var/log/classroomio/api-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: { NODE_ENV: 'development', PORT: 3081 },
      env_production: { NODE_ENV: 'production', PORT: 3081 }
    },
    {
      name: 'cio-dashboard',
      cwd: `${APP_DIR}/apps/dashboard`,
      script: 'build/index.js',
      exec_mode: 'fork',
      instances: 1,
      node_args: nodeArgs(caps.dashHeap),
      max_memory_restart: caps.dash,
      autorestart: true,
      watch: false,
      kill_timeout: 10000,
      out_file: '/var/log/classroomio/dashboard-out.log',
      error_file: '/var/log/classroomio/dashboard-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: { NODE_ENV: 'development', PORT: 3082 },
      env_production: { NODE_ENV: 'production', PORT: 3082 }
    },
    {
      name: 'cio-jobs',
      cwd: `${APP_DIR}/apps/jobs`,
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      node_args: nodeArgs(caps.jobsHeap),
      max_memory_restart: caps.jobs,
      autorestart: true,
      watch: false,
      kill_timeout: 30000,
      out_file: '/var/log/classroomio/jobs-out.log',
      error_file: '/var/log/classroomio/jobs-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' }
    }
  ]
};
