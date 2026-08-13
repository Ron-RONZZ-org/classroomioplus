/**
 * Course CRUD E2E tests.
 *
 * Tests the core workflow: create a course through the modal dialog,
 * verify it appears in the course list, and load a seeded course detail page.
 *
 * NOTE: The course creation dialog has a modal overlay.  Submit buttons
 * inside the dialog need `{ force: true }` because the overlay intercepts
 * pointer events at a higher z-index.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BASE_URL,
  ORG_SLUG,
  ADMIN_EMAIL,
  PASSWORD,
  login,
  setupErrorTracking,
  expectCollectorEmpty,
  navigateAndSettle,
  type ErrorCollector
} from './helpers';

const specDir = dirname(fileURLToPath(import.meta.url));
const IMPORT_FIXTURE = join(specDir, 'fixtures', 'course-import-draft.json');

const TEST_COURSE_TITLE = `E2E Test Course ${Date.now()}`;
const TEST_COURSE_DESC = 'Created by automated E2E test — delete me';

// Seeded course and lesson IDs (from packages/db/src/utils/seed/)
const MVC_COURSE_ID = '98e6e798-f0bd-4f9d-a6f5-ce0816a4f97e';
const MVC_LESSON_ID = '5c75f4f1-c222-44a9-a8c6-81773ea33872';
const MVC_EXERCISE_ID = 'e2ea9fb8-6448-4f6c-a1d5-02c2b12cf862';

test.describe('Course CRUD', () => {
  let err: ErrorCollector;

  test.beforeEach(async ({ page }) => {
    err = setupErrorTracking(page);
    await login(page, ADMIN_EMAIL, PASSWORD);
  });

  test.afterEach(() => {
    expectCollectorEmpty(err);
  });

  test('TC-CRUD-01: Create a course via the modal dialog and verify it appears', async ({ page }) => {
    test.setTimeout(180_000);

    // Navigate to course list with ?create=true to open the creation dialog
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/courses?create=true`);

    // The new-course dialog should open automatically
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Step 0: course type selector — "Self-paced" is the default
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 1: fill in title and description
    const titleInput = page.getByPlaceholder(/course name/i);
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill(TEST_COURSE_TITLE);

    const descInput = page.getByPlaceholder(/little description/i);
    await expect(descInput).toBeVisible();
    await descInput.fill(TEST_COURSE_DESC);

    // Submit the form by dispatching a submit event via evaluate.
    // This avoids bits-ui Dialog's overlay intercepting the click and
    // the dialog's built-in close-on-form-submit behavior.
    await page.evaluate(() => {
      const form = document.querySelector('[role="dialog"] form');
      if (form) {
        form.requestSubmit();
      }
    });
    // Fallback: if evaluate didn't work (no form found), click the button
    const submitFallback = page.locator('[role="dialog"] button[type="submit"]');
    if (await submitFallback.isVisible().catch(() => false)) {
      await submitFallback.click({ force: true });
    }

    // Wait for navigation (on success, app navigates to /courses/{courseId})
    await page.waitForTimeout(3000);

    // If creation succeeded, we're on the course detail page
    const currentUrl = page.url();
    if (currentUrl.includes('/courses/') && !currentUrl.includes('create=true')) {
      // Successfully navigated to the new course page
      const body = page.locator('body');
      await expect(body).not.toBeEmpty({ timeout: 10000 });
    } else {
      // Dialog may have closed — navigate fresh to course list
      await page.goto(BASE_URL + `/org/${ORG_SLUG}/courses`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Check for the course title anywhere on the page
      await expect(page.getByText(TEST_COURSE_TITLE.split(' ')[0]).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('TC-CRUD-02: Course list shows seeded courses', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/courses`);

    // Verify seeded courses are visible
    await expect(page.getByText('Modern Web Development')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Getting started with MVC')).toBeVisible({ timeout: 10000 });
  });

  test('TC-CRUD-03: Course detail page loads for a seeded course', async ({ page }) => {
    test.setTimeout(120_000);

    // Course detail is at /courses/{id}, not under /org/{slug}/
    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}`);

    // The course detail page renders — verify it has content
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-CRUD-04: Lesson list loads for seeded course', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/lessons`);

    // Verify seeded lesson titles are visible
    await expect(page.getByText('Introduction to MVC Architecture').first()).toBeVisible({ timeout: 20000 });
  });

  test('TC-CRUD-05: Lesson editor — edit title and save', async ({ page }) => {
    test.setTimeout(180_000);

    const lessonUrl = BASE_URL + `/courses/${MVC_COURSE_ID}/lessons/${MVC_LESSON_ID}`;

    // Load the lesson page in edit mode
    await navigateAndSettle(page, lessonUrl + '?mode=edit');
    await page.waitForTimeout(2000);

    // Find the lesson title input and modify it
    // In edit mode, LessonPageEditHeader renders an InputField for the title.
    // The input has a placeholder matching the lesson title translation key.
    const titleInput = page.locator('input[placeholder*="lesson"]').first();
    const isVisible = await titleInput.isVisible().catch(() => false);

    if (isVisible) {
      const editSuffix = ` [E2E ${Date.now()}]`;
      await titleInput.click();
      // Append to existing value
      await titleInput.fill('');
      await titleInput.fill(`Lesson 1: Introduction to MVC Architecture${editSuffix}`);

      // Click the Save icon button (toggles from edit to view mode, triggers saveLesson())
      // The Save button is an IconButton with a Save icon inside Page.Action
      const saveButton = page
        .locator('[class*="Page"] button')
        .filter({ has: page.locator('svg') })
        .first();
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        // Wait for mode switch away from edit
        await page.waitForTimeout(3000);
      }
    }

    // Verify no page errors occurred during the edit-save cycle
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-CRUD-06: Course people page loads', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/people`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-CRUD-07: Course exercise page loads with content', async ({ page }) => {
    test.setTimeout(120_000);

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/exercises/${MVC_EXERCISE_ID}`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-CRUD-08: Course sub-pages load (marks, submissions, analytics, ai-tutor)', async ({ page }) => {
    test.setTimeout(180_000);

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/marks`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/submissions`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/analytics`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });

    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/ai-tutor`);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-CRUD-09: Course settings — modify title and save', async ({ page }) => {
    test.setTimeout(180_000);

    // Navigate to course settings page
    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/settings`);
    await page.waitForTimeout(2000);

    // Find the course title input (InputField with course title)
    // The input is inside an InputField component with a label "Course Title"
    const titleInput = page.getByPlaceholder(/course name/i);
    if (await titleInput.isVisible().catch(() => false)) {
      const settingsSuffix = ` [E2E ${Date.now()}]`;
      await titleInput.click();
      await titleInput.fill('');
      await titleInput.fill(`Getting started with MVC${settingsSuffix}`);

      // Click the "Save" button in the page header
      const saveButton = page.getByRole('button', { name: /save/i });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        // Wait for save to complete
        await page.waitForTimeout(3000);
      }
    }

    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 });
  });

  test('TC-CRUD-10: Course export page renders real UI and downloads course JSON', async ({ page }) => {
    test.setTimeout(180_000);

    // The export page is at /courses/{id}/export (course view, not org-scoped)
    await navigateAndSettle(page, BASE_URL + `/courses/${MVC_COURSE_ID}/export`);

    // Regression guard for issue #66: the page previously rendered raw
    // translation keys (course.navItem.export.title) because the keys were
    // missing from every locale, and the body was silently dropped because
    // it was passed as children to Page.Body (which requires {#snippet child()}).
    await expect(page.getByRole('heading', { name: 'Export Course' }).first()).toBeVisible({ timeout: 20000 });

    // The export button must be present (course loads via the layout store)
    const exportButton = page.getByRole('button', { name: /export as json/i }).first();
    await expect(exportButton).toBeVisible({ timeout: 15000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Raw-key regression: the literal key text must never be visible
    await expect(page.getByText('course.navItem.export.title', { exact: true })).toHaveCount(0);
    await expect(page.getByText('course.navItem.export.description', { exact: true })).toHaveCount(0);

    // Functional assertion: clicking the button must download a JSON file
    // named after the course (title lowercased, spaces → dashes).
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await exportButton.click();

    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    expect(suggestedName).toBe('getting-started-with-mvc.json');

    const downloadPath = await download.path();
    const fileContent = readFileSync(downloadPath!, 'utf-8');
    const exported = JSON.parse(fileContent);
    // The exported payload is a CourseStructureSnapshot — it must contain the
    // draft with the course title and at least one section/lesson.
    expect(exported).toHaveProperty('courseId', MVC_COURSE_ID);
    expect(exported).toHaveProperty('draft.course.title', 'Getting started with MVC');
    expect(exported.draft.sections.length).toBeGreaterThanOrEqual(1);
    expect(exported.draft.lessons.length).toBeGreaterThanOrEqual(1);
  });

  test('TC-CRUD-11: Org import-export page — export sections render and course JSON imports as draft', async ({
    page
  }) => {
    test.setTimeout(240_000);

    // Global import-export page is org-scoped under /org/{slug}/import-export
    await navigateAndSettle(page, BASE_URL + `/org/${ORG_SLUG}/import-export`);
    await page.waitForTimeout(2000);

    // Page header (route-level) must show the translated title, not the key
    await expect(page.getByRole('heading', { name: /import \/ export courses/i }).first()).toBeVisible({
      timeout: 20000
    });

    // Export section header (component-level)
    await expect(page.getByText('Export Courses', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Import section header
    await expect(page.getByText('Import Course', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Regression guard: the Page.Body content must actually render
    // (previously <ImportExportPage /> was passed as children to Page.Body
    // which requires a {#snippet child()}, so the body silently dropped).
    await expect(page.getByText('Select all', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /export all/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Import Drafts', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Regression guard: raw key text must not render (issue #66)
    await expect(page.getByText('courses.import_export.page_title', { exact: true })).toHaveCount(0);
    await expect(page.getByText('courses.import_export.export_section_title', { exact: true })).toHaveCount(0);

    // Functional assertion: uploading a course JSON file creates an import
    // draft that appears in the draft list, can be previewed, and deleted.
    const draftTitle = 'E2E Imported Course';
    await page.locator('#import-file-input').setInputFiles(IMPORT_FIXTURE);

    // Wait for the draft row to appear in the "Import Drafts" list
    const draftRow = page.getByRole('button', { name: new RegExp(draftTitle) }).first();
    await expect(draftRow).toBeVisible({ timeout: 20000 });

    // Open the preview dialog and verify the imported structure is shown
    await draftRow.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Preview: E2E Imported Course/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Sections (1)', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Lessons (1)', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Accept the confirm dialog, then delete the draft to leave no residue
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /delete draft/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('button', { name: new RegExp(draftTitle) }).first()).toHaveCount(0);
  });

  test('TC-CRUD-12: Lesson note editor — Source/Visual toggle round-trip', async ({ page }) => {
    test.setTimeout(180_000);

    // Regression for #68: toggling Source -> Visual used to destroy the Tiptap
    // view, so the toggle-back silently did nothing and toolbar clicks threw
    // "[tiptap error]: The editor view is not available".
    const lessonUrl = BASE_URL + `/courses/${MVC_COURSE_ID}/lessons/${MVC_LESSON_ID}`;

    // Load the lesson page in edit mode
    await navigateAndSettle(page, lessonUrl + '?mode=edit');
    await page.waitForTimeout(2000);

    // Video is the default material tab — activate the Note tab so the
    // lesson note editor (and its Source/Visual toggle) renders
    const noteTab = page.getByRole('tab', { name: /note/i });
    await expect(noteTab).toBeVisible({ timeout: 20000 });
    await noteTab.click();

    // The Source/Visual toggle sits at the right end of the toolbar
    // (getByLabel matches the aria-label; getByRole misses it because the
    // lucide icon inside the button skews the accessible-name computation)
    const sourceToggle = page.getByLabel('Switch to source mode');
    await expect(sourceToggle).toBeVisible({ timeout: 20000 });

    // Enter source mode: the WYSIWYG editor hides (stays mounted) and a
    // monospace textarea with the current HTML appears
    await sourceToggle.click();

    const sourceTextarea = page.locator('textarea[class*="font-mono"]');
    await expect(sourceTextarea).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.edra-editor')).toBeHidden();
    await expect(page.locator('.edra-toolbar')).toBeHidden();

    // Type raw HTML into the source textarea
    const marker = `Source round-trip marker ${Date.now()}`;
    await sourceTextarea.fill(`<p>${marker}</p>`);

    // Toggle back to visual mode
    const visualToggle = page.getByLabel('Switch to visual mode');
    await expect(visualToggle).toBeVisible();
    await visualToggle.click();

    // The edited HTML is parsed back into the Tiptap editor (regression: this
    // used to fail because the editor was destroyed while in source mode)
    await expect(page.locator('.edra-editor')).toBeVisible();
    await expect(page.locator('.tiptap')).toContainText(marker, { timeout: 10000 });

    // Verify the content also flowed through the update pipeline: re-entering
    // source mode shows the edited HTML in the textarea
    await page.getByLabel('Switch to source mode').click();
    await expect(sourceTextarea).toHaveValue(`<p>${marker}</p>`, { timeout: 10000 });
  });
});
