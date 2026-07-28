# E2E Coverage: Round 2 — Spec

## Scope

This spec describes E2E tests to close the coverage gap identified in
[#52](https://github.com/Ron-RONZZ-org/classroomioplus/issues/52). PR #51
and PR #53 covered ~20 route patterns; ~70 remain. This round targets the
highest-impact gaps with emphasis on **POST/PUT interactive tests** that
exercise form submission, lesson editing, enrollment, save actions, and
content creation.

## Test infrastructure conventions

All conventions from `apps/dashboard/e2e/helpers.ts` apply:

- Login via actual form (`login()` helper) — not API shortcut.
- Fresh browser context per test (Playwright default).
- Error tracking via `setupErrorTracking` / `expectCollectorEmpty` on every
  test (page errors = assertion failure; console errors = logged).
- `navigateAndSettle(url)` for navigation: goto + wait for session API call
  + 2s settling window.
- `benchNavigate(url, label)` for optional timing when `E2E_BENCHMARK=true`.
- Tests group multiple page navigations per `test()` to amortize login cost
  (Vite dev server lazy-compiles each route on first visit).
- Each test has 60–180s timeout depending on number of navigations.
- **Data side effects are acceptable** — the dev database is ephemeral and
  tests create/modify data without cleanup.

## Seed data reference

All tests use seeded data from `packages/db/src/utils/seed/`:

| Entity | ID | Slug / Identifier |
|--------|----|-------------------|
| udemy-test org | (DB auto) | `udemy-test` |
| admin user | (DB auto) | `admin@test.com` / `123456` |
| student user | (DB auto) | `student@test.com` / `123456` |
| MVC course | `98e6e798-f0bd-4f9d-a6f5-ce0816a4f97e` | `getting-started-with-mvc` |
| React course | `16e3bc8d-5d1b-4708-988e-93abae288ccf` | `modern-web-development` |
| Pandas course | `f0a85d18-aff4-412f-b8e6-3b34ef098dce` | `data-science-with-python-and-pandas-1702919269375` |
| MVC lesson 1 | `5c75f4f1-c222-44a9-a8c6-81773ea33872` | "Lesson 1: Introduction to MVC Architecture" |
| MVC lesson 2 | `a99e65b7-1394-4751-ad8d-a5fb670ccb9e` | "Anatomy of MVC Components" |
| MVC section | `b2c8e7a0-1f3d-4e5a-9b6c-0d1e2f3a4b5c` | "Getting Started" |
| MVC exercise 1 | `e2ea9fb8-6448-4f6c-a1d5-02c2b12cf862` | "MVC essentials quiz" |

## Test descriptions

### File: `auth.spec.ts` (new) — Auth flow pages

**TC-AUTH-01: Signup page renders**
- Route: `GET /signup`
- No auth required
- Assertions:
  - `body` is not empty
  - Email input (`#email`), password inputs, and submit button present

**TC-AUTH-02: Signup form submits and creates account** (POST)
- Route: form submission at `/signup` via `authClient.signUp.email()`
- No auth required
- Flow:
  1. Navigate to `/signup`
  2. Fill email (`e2e-test-{Date.now()}@test.com`), password, confirm
  3. Click submit button
- Assertions:
  - Form submits without page error
  - Redirect away from `/signup` (success)
- Edge case: timestamped email guarantees uniqueness

**TC-AUTH-03: Forgot and reset password pages render**
- Routes: `GET /forgot`, `GET /reset`
- No auth required
- Assertions: `body` not empty, form elements present

### File: `public-flow.spec.ts` (new) — Public pages & enrollment

**TC-PUB-01: Public course catalog loads**
- Route: `GET /courses` (org-site route group)
- No auth required (self-hosted: `isOrgSite` always true)
- Assertions: seeded course titles visible, no page errors

**TC-PUB-02: Course landing page loads**
- Route: `GET /course/getting-started-with-mvc`
- No auth required
- Assertions: course title visible, CTA present

**TC-PUB-03: Student enrolls in a course** (POST)
- Route: `GET /course/getting-started-with-mvc/enroll` → auto-enroll or
  button click triggers `courseApi.enroll()` (POST)
- Auth: student must be logged in first
- Flow:
  1. Login as `student@test.com`
  2. Wait for student redirect to `/lms`
  3. Navigate to enrollment page
  4. Auto-enroll `$effect` should fire, or button is clickable
- Assertions:
  - No page errors during enrollment
  - Success state or redirect to course
- Precondition: Student not already enrolled, or graceful already-enrolled
  state

### File: `course-flow.spec.ts` (extend) — Course management

All tests in `Course CRUD` describe block (admin login in beforeEach).

**TC-CRUD-04: Lesson list loads for seeded course**
- Route: `GET /courses/{mvcCourseId}/lessons`
- Assertions: section/chapter list renders, lesson title visible

**TC-CRUD-05: Lesson editor — edit title and save** (PUT)
- Routes:
  - `GET /courses/{mvcCourseId}/lessons/{lessonId}?mode=edit` (load in
    edit mode)
  - `PUT /courses/{courseId}/lesson/{lessonId}` (via `lessonApi.update()`
    on save triggered by exiting edit mode)
- Flow:
  1. Navigate to lesson with `?mode=edit`
  2. Find the lesson title input (`InputField` rendered by
     `LessonPageEditHeader`)
  3. Modify the title (append timestamped suffix)
  4. Click the **Save** icon button (toggles to view mode, triggers
     `saveLesson()`)
  5. Wait for mode switch (URL param `mode` removed)
  6. Verify no page errors
- This is the **P0 feature from the issue** — the most complex UI in the
  app. Even a simple title edit + save exercises the full render → edit →
  save pipeline.

**TC-CRUD-06: Course people page loads**
- Route: `GET /courses/{mvcCourseId}/people`
- Assertions: `body` not empty, no page errors

**TC-CRUD-07: Course exercise page loads**
- Route: `GET /courses/{mvcCourseId}/exercises/{exerciseId}`
- Assertions: exercise title visible, no page errors

**TC-CRUD-08: Course sub-pages load**
- Routes (sequential, one test):
  - `GET /courses/{mvcCourseId}/marks`
  - `GET /courses/{mvcCourseId}/submissions`
  - `GET /courses/{mvcCourseId}/analytics`
  - `GET /courses/{mvcCourseId}/ai-tutor`
- Assertions per page: `body` not empty, no page errors

**TC-CRUD-09: Course settings — modify title and save** (PUT)
- Routes:
  - `GET /courses/{mvcCourseId}/settings` (load)
  - `PUT /courses/{courseId}` (via `courseApi.update()` on Save click)
- Flow:
  1. Navigate to settings page
  2. Modify course title (append " [E2E]")
  3. Click the "Save" button in the page header (`Page.Action`)
  4. Verify save completes without error
- Assertions: save succeeds, no page errors

### File: `org-admin.spec.ts` (extend) — Org administration

**TC-ADMIN-04: Media page loads**
- Route: `GET /org/udemy-test/media`
- Assertions: page renders with heading, no page errors

**TC-ADMIN-05: Org profile — modify name and save** (PUT)
- Routes:
  - `GET /org/udemy-test/settings/org` (load)
  - `PUT /org/{orgId}` (via `orgApi.update()` via header Save button)
- Flow:
  1. Navigate to org settings
  2. Read current org name from input
  3. Append timestamp suffix
  4. Click header "Save" button
  5. Verify save completes
- Assertions: no page errors

**TC-ADMIN-06: Settings pages load**
- Routes (sequential):
  - `/org/udemy-test/settings/notifications`
  - `/org/udemy-test/settings/integrations`
  - `/org/udemy-test/settings/customize-lms`
  - `/org/udemy-test/settings/billing`
  - `/org/udemy-test/settings/workspaces`
  - `/org/udemy-test/settings/ai-credits`
  - `/org/udemy-test/settings/ai-tutor`
- Assertions per page: `body` not empty, no page errors

**TC-ADMIN-07: Management pages load**
- Routes (sequential, split across 2 tests):
  - `/org/udemy-test/cohorts`
  - `/org/udemy-test/community`
  - `/org/udemy-test/widgets`
  - `/org/udemy-test/import-export`
  - `/org/udemy-test/api`
  - `/org/udemy-test/mcp`
  - `/org/udemy-test/zapier`
  - `/org/udemy-test/teams-overview`
  - `/org/udemy-test/compliance`
- Assertions per page: `body` not empty, no page errors

**TC-ADMIN-08: Community question — ask and publish** (POST)
- Routes:
  - `GET /org/udemy-test/community/ask` (load form)
  - `POST /community` (via `communityApi.createQuestion()` on Publish)
- Flow:
  1. Navigate to community ask page
  2. Fill question title
  3. Click "Publish" button
- Assertions: creation completes without page error, success state or
  redirect

### File: `student-flow.spec.ts` (extend) — Student LMS pages

**TC-STU-04: Student certificates and cohorts**
- Routes: `GET /lms/certificates`, `GET /lms/cohorts`

**TC-STU-05: Student community and exercises**
- Routes: `GET /lms/community`, `GET /lms/exercises`

**TC-STU-06: Student settings pages**
- Routes: `GET /lms/settings`, `GET /lms/settings/notifications`,
  `GET /lms/settings/integrations`

All student tests use student login in `beforeEach`, assert `body` not
empty and no page errors per page.

## Interactive vs passive test count

| Type | Count | Tests |
|------|-------|-------|
| **POST request** | 3 | TC-AUTH-02 (signup), TC-PUB-03 (enrollment), TC-ADMIN-08 (community) |
| **PUT request** | 3 | TC-CRUD-05 (lesson editor), TC-CRUD-09 (course settings), TC-ADMIN-05 (org profile) |
| **GET page load (auth)** | 9 | TC-CRUD-04/06/07/08, TC-ADMIN-06/07, TC-STU-04/05/06 |
| **GET page load (public)** | 3 | TC-AUTH-01/03, TC-PUB-01/02 |
| **Total** | **18** | |

**6 of 18 tests (33%) exercise POST/PUT mutations**, covering:
- Lesson editing (P0)
- Course settings (core CRUD)
- Org profile (admin workflow)
- Signup (auth flow)
- Enrollment (student journey)
- Community question (user-generated content)

## Routes covered

42 route patterns across 18 tests and 5 spec files. Key routes under test:

| Route | Method | Priority |
|-------|--------|----------|
| `/courses/:id/lessons/:lessonId` | PUT | **P0** — lesson editor save |
| `/courses/:id/settings` | PUT | P1 — course settings save |
| `/org/:slug/settings/org` | PUT | P1 — org profile save |
| `/signup` | POST | P2 — account creation |
| `/course/[slug]/enroll` | POST | P0 — student enrollment |
| `/org/:slug/community/ask` | POST | P2 — community question |
| +36 GET routes | GET | P2 — route coverage |

## Behavioral contracts

1. **Login**: `login()` in `beforeEach` for all authenticated tests.
2. **Navigation**: `navigateAndSettle()` waits for hydration.
3. **Org-site routes**: Accessible at root without subdomain (self-hosted).
4. **Student redirect**: After login, redirects to `/lms`. Tests wait 20s.
5. **Lesson editing**: Load with `?mode=edit`, modify title, click Save
   icon button to exit edit mode → triggers `saveLesson()` (PUT).
6. **Form save buttons**: Course/org settings use header Save button.
7. **Data isolation**: Side effects OK — DB is re-seedable.
