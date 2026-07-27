<h1 align="center">LibreClassroom</h1>
<p align="center">
  Community fork of <a href="https://github.com/classroomio/classroomio">ClassroomIO</a> —
  an open-source LMS — focused on easy self-hosting
  <br />
  <a href="https://github.com/Ron-RONZZ-org/classroomioplus/issues">Issues</a>
</p>

## About

LibreClassroom is a **community-maintained fork** of [ClassroomIO](https://github.com/classroomio/classroomio), the open-source Learning Management System for organizations. This fork exists to serve self-hosters with enhancements that may not align with upstream's SaaS-focused roadmap.

**We are immensely grateful to the upstream ClassroomIO team** — they built the foundation. Our changes are small and focused on making self-hosting cleaner and easier.

### What's different

| Area | ClassroomIO | LibreClassroom |
|------|-------------|-----------------|
| Custom AI endpoint | Selected providers | **Configurable** — any OpenAI-compatible provider|
| Telemetry (Posthog, Umami) | Enabled by default | **Off by default** — opt-in toggle in admin settings |
| License verification | License key validation by external classroomio API | **No external validation: you own your instance** |
| Upstream updates | Everything | **Selective** — only what the self-hosting community wants |

### What's always the same

**Course & Content**
- Course management — unlimited courses, lessons, exercises, grading, and certificates
- Cohorts — group courses into cohorts with goals, team management, and progress tracking
- AI Course Builder — generate outlines, lesson content, and assignments (Gemini, GPT-4o, Claude)
- AI Lesson Tutor — in-lesson AI assistant for learners

**Compliance & Certification**
- Compliance tracking — deadlines, renewals, grace periods, waivers, certificates with custom IDs
- Certificates — issue branded certificates with custom IDs

**Learner & Org Experience**
- Multi-org & multi-teacher — invite teachers, assign courses, manage organizations
- Student dashboard — learners access all courses, assignments, and progress in one place
- Multilingual — deliver content in 10+ languages

**Integrations & Developer Tools**
- REST API + Webhooks — enroll users, trigger automations, receive events
- MCP server — `@classroomio/mcp` on npm for AI-native integrations
- Embeddable widget — embed your course catalog on any website

## Built With

- [SvelteKit](https://kit.svelte.dev/)
- [Hono](https://hono.dev/)
- [PostgreSQL](https://www.postgresql.org/)
- [Better Auth](https://www.better-auth.com/)
- [TailwindCSS](https://tailwindcss.com/)

## Deploy

The easiest way to run LibreClassroom:

```bash
# 1. Clone
git clone https://github.com/Ron-RONZZ-org/classroomioplus.git
cd classroomioplus

# 2. Configure
cp .env.example .env
# Edit .env — set DASHBOARD_ORIGIN, secrets, SMTP, object storage

# 3. Start
docker compose up -d
```

This starts the full stack: Postgres, Redis, MinIO (object storage), API, dashboard, and background worker. See [docker/docs/SELF_HOST.md](docker/docs/SELF_HOST.md) for the complete guide.

### Migrating from vanilla ClassroomIO

If you already run classroomio/classroomio with Docker:

```bash
docker compose down
docker compose -f docker-compose.plus.yaml up -d
```

Same volumes, same data. No migration needed.

## Development

Since this is a fork with our commits on top of upstream, see [AGENTS.md](AGENTS.md) for the workflow.

### Prerequisites

- **[Node.js](https://nodejs.org/)** (Version: >=20.19.3)
- **[pnpm](https://pnpm.io/installation)** (v10)
- **[Docker](https://docs.docker.com/engine/install/)** — runs Postgres + Redis
  - **Ubuntu**: `sudo apt-get install docker-compose-v2` for `docker compose` (v2) support

### Project Structure

This repo is a monorepo (same structure as upstream):

1. `website` — landing page
2. `api` — backend API (Hono)
3. `dashboard` — SvelteKit web application
4. `docs` — documentation

Shared packages live under `packages/` (`packages/db`, `packages/utils`, `packages/ui`, etc.).

### Local Setup

1. **Install dependencies:**

   ```bash
   pnpm i
   ```

2. **Create `.env` files:**

   The project root needs a minimal `.env` for Docker Compose (it validates ALL variable references, even for services you're not starting). The API, dashboard, and jobs each read their own `.env`.

   ```bash
   # Generate a shared secret key (use the same value everywhere)
   SERVER_KEY=$(openssl rand -hex 32)

   # Root .env — required for Docker Compose to parse the compose file
   echo "BETTER_AUTH_SECRET=$SERVER_KEY" > .env
   echo "PRIVATE_SERVER_KEY=$SERVER_KEY" >> .env

   # API
   cp apps/api/.env.example apps/api/.env
   # Edit apps/api/.env — fill in DATABASE_URL, REDIS_URL, PUBLIC_SERVER_URL,
   # TRUSTED_ORIGINS, and paste the SERVER_KEY as BETTER_AUTH_SECRET

   # Dashboard
   # Edit apps/dashboard/.env — set:
   #   PUBLIC_SERVER_URL=http://localhost:3002
   #   PRIVATE_SERVER_URL=http://localhost:3002
   #   PRIVATE_SERVER_KEY=<same SERVER_KEY value>
   #   PUBLIC_IS_SELFHOSTED=true

   # Jobs (copy from API — same DATABASE_URL and REDIS_URL)
   cp apps/api/.env apps/jobs/.env

   # DB scripts
   cp packages/db/.env.example packages/db/.env
   ```

   The two `PRIVATE_SERVER_KEY` values (root `.env` and `apps/dashboard/.env`) **must match**. Generate once, paste twice.

3. **Build shared packages** (workspace packages are imported from `dist/`):

   ```bash
   pnpm turbo run build --filter=@cio/api^... --filter=@cio/dashboard^...
   ```

4. **Start local infrastructure:**

   ```bash
   docker compose -f docker-compose.yaml up -d postgres redis
   pnpm --filter @cio/db db:setup:seed
   ```

5. **Run the apps** (in separate terminals):

   ```bash
   pnpm api:dev        # API on http://localhost:3002
   pnpm dashboard:dev  # Dashboard on http://localhost:5173
   ```

6. **Login:** `admin@test.com` / `123456`

### Testing

This monorepo has tests at several layers, though coverage is still maturing (tracked in [epic #16](https://github.com/Ron-RONZZ-org/classroomioplus/issues/16)).

```bash
# API service logic (vitest) — ~61 tests
pnpm --filter @cio/api test

# Question type validation (vitest)
pnpm --filter @cio/question-types test

# Email template rendering (vitest)
pnpm --filter @cio/email test

# Course-app template unit tests (vitest)
pnpm --filter @cio/course-app test

# Dashboard utility tests (vitest)
pnpm --filter @cio/dashboard test
```

**Dashboard unit tests** are currently broken (Jest config issue) — tracked in [#17](https://github.com/Ron-RONZZ-org/classroomioplus/issues/17).

**E2E tests**: The repo has no browser E2E tests for the dashboard yet. A single Playwright spec exists for the course-app template at `packages/course-app/src/template/tests/course.spec.ts`:

```bash
cd packages/course-app/src/template
pnpm test:e2e
```

See the [testing coverage epic](https://github.com/Ron-RONZZ-org/classroomioplus/issues/16) for the planned phased improvements.

### Enabling AI Features

Set at least one provider API key in `apps/api/.env`:

```bash
OPENAI_API_KEY=sk-...        # GPT-4o
GOOGLE_API_KEY=AIza...       # Gemini (default)
ANTHROPIC_API_KEY=sk-ant-... # Claude
```

No plan restrictions, no token caps — your API key, your usage.

## Relationship to Upstream

```
classroomio/classroomio (upstream)
    │
    └── Ron-RONZZ-org/classroomioplus (this fork)
          │
          └── our commits on top of upstream tags
```

We maintain our fork by **rebasing** our commits onto new upstream releases. We cherry-pick upstream changes selectively — only what the self-hosting community wants. Upstream PRs are welcome, especially features that benefit all users.

## License

AGPL-3.0 — same as upstream. This fork exists to preserve that license for the self-hosting community.
