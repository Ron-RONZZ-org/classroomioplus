<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { Badge } from '@cio/ui/base/badge';
  import { Button } from '@cio/ui/base/button';
  import * as Card from '@cio/ui/base/card';
  import * as Dialog from '@cio/ui/base/dialog';
  import * as Field from '@cio/ui/base/field';
  import { Input } from '@cio/ui/base/input';
  import { Checkbox } from '@cio/ui/base/checkbox';
  import { Label } from '@cio/ui/base/label';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import TrashIcon from '@lucide/svelte/icons/trash-2';
  import UploadIcon from '@lucide/svelte/icons/upload';
  import SearchIcon from '@lucide/svelte/icons/search';
  import { t } from '$lib/utils/functions/translations';
  import { courseExportApi, courseImportApi, coursesApi } from '$features/course/api';
  import { snackbar } from '$features/ui/snackbar/store';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';

  // ── Export state ──
  let searchQuery = $state('');
  let selectedIds = $state(new SvelteSet<string>());

  // ── Import state ──
  let isImporting = $state(false);
  let importProgress = $state({ current: 0, total: 0 });
  let importDoneCount = $state(0);

  // ── Preview dialog state ──
  let previewDraftId = $state<string | null>(null);
  let isPublishing = $state(false);
  let isDeleting = $state(false);

  onMount(() => {
    if (!coursesApi.orgCourses || coursesApi.orgCourses.length === 0) {
      coursesApi.getOrgCourses();
    }
    courseImportApi.listDrafts();
  });

  // ── Export helpers ──

  const courses = $derived(coursesApi.orgCourses ?? []);

  const filteredCourses = $derived(
    searchQuery ? courses.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())) : courses
  );

  const selectedCount = $derived(selectedIds.size);

  function toggleCourse(id: string, checked: boolean) {
    if (checked) {
      selectedIds.add(id);
    } else {
      selectedIds.delete(id);
    }
  }

  function selectAll() {
    for (const c of filteredCourses) {
      selectedIds.add(c.id);
    }
  }

  function deselectAll() {
    selectedIds.clear();
  }

  function isSelected(id: string) {
    return selectedIds.has(id);
  }

  const selectedCoursesList = $derived(
    courses.filter((c) => selectedIds.has(c.id)).map((c) => ({ id: c.id, title: c.title }))
  );

  async function handleExportSelected() {
    if (selectedCoursesList.length === 0) return;

    await courseExportApi.exportMultiple(selectedCoursesList);
    if (courseExportApi.success) {
      snackbar.success($t('courses.import_export.success_export'));
    }
  }

  async function handleExportAll() {
    const allCourses = courses.map((c) => ({ id: c.id, title: c.title }));
    await courseExportApi.exportMultiple(allCourses);
    if (courseExportApi.success) {
      snackbar.success($t('courses.import_export.success_export'));
    }
  }

  // ── Import helpers ──

  async function handleFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    isImporting = true;
    importProgress = { current: 0, total: files.length };
    importDoneCount = 0;

    for (const file of files) {
      importProgress = { ...importProgress, current: importProgress.current + 1 };

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        await courseImportApi.createDraft(json as Record<string, unknown>);
        if (courseImportApi.success) {
          importDoneCount += 1;
        } else {
          console.error('Failed to import draft from file:', file.name, courseImportApi.error);
        }
      } catch (err) {
        console.error('Failed to process file:', file.name, err);
      }
    }

    isImporting = false;

    if (importDoneCount > 0) {
      snackbar.success($t('courses.import_export.success_import'));
    }
  }

  // ── Preview dialog ──

  const previewDraft = $derived(
    previewDraftId ? (courseImportApi.drafts.find((d) => d.id === previewDraftId) ?? null) : null
  );

  const previewSummary = $derived(
    previewDraft?.summary
      ? (previewDraft.summary as {
          sectionCount?: number;
          lessonCount?: number;
          exerciseCount?: number;
          localeCount?: number;
          warningCount?: number;
        })
      : null
  );

  function openPreview(draftId: string) {
    previewDraftId = draftId;
    courseImportApi.currentDraft = null; // clear stale data while fetching
    courseImportApi.getDraft(draftId);
  }

  function closePreview() {
    previewDraftId = null;
    courseImportApi.currentDraft = null;
  }

  async function handlePublish() {
    if (!previewDraftId) return;

    isPublishing = true;
    const courseUrl = await courseImportApi.publishDraft(previewDraftId);
    isPublishing = false;

    if (courseImportApi.success && courseUrl) {
      snackbar.success($t('courses.import_export.publish_success'));
      closePreview();
      // Navigate to the new course
      const courseId = courseUrl.split('/').pop() ?? '';
      if (courseId) {
        goto(resolve(`/courses/${courseId}`, {}));
      }
    } else {
      snackbar.error($t('courses.import_export.publish_error'));
    }
  }

  async function handleDeleteDraft() {
    if (!previewDraftId) return;

    const confirmed = window.confirm($t('courses.import_export.delete_draft_confirm'));
    if (!confirmed) return;

    isDeleting = true;
    await courseImportApi.deleteDraft(previewDraftId);
    isDeleting = false;

    if (courseImportApi.success) {
      snackbar.success($t('courses.import_export.delete_draft_success'));
      closePreview();
    }
  }

  const isLoadingExport = $derived(courseExportApi.isLoading);

  // ── Draft list helpers ──
  const activeDrafts = $derived(courseImportApi.drafts.filter((d) => d.status === 'DRAFT'));

  const statusVariant = (status: string) => {
    if (status === 'PUBLISHED') return 'success' as const;
    if (status === 'ARCHIVED') return 'secondary' as const;
    return 'outline' as const;
  };

  const draftLocaleDisplay = (locale: string) => locale.toUpperCase();
</script>

<div class="space-y-8">
  <!-- ── Export section ── -->
  <Card.Root>
    <Card.Header>
      <Card.Title>{$t('courses.import_export.export_section_title')}</Card.Title>
      <Card.Description>{$t('courses.import_export.export_section_description')}</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4">
      <div class="relative">
        <SearchIcon class="ui:text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          bind:value={searchQuery}
          placeholder={$t('courses.import_export.select_courses_placeholder')}
          class="w-full max-w-md pl-9"
        />
      </div>

      <div class="flex items-center gap-4 text-sm">
        <button onclick={selectAll} class="ui:text-primary cursor-pointer underline underline-offset-2">
          {$t('courses.import_export.select_all')}
        </button>
        <button onclick={deselectAll} class="ui:text-muted-foreground cursor-pointer underline underline-offset-2">
          {$t('courses.import_export.deselect_all')}
        </button>
        {#if selectedCount > 0}
          <span class="ui:text-muted-foreground text-sm tabular-nums">
            {selectedCount} selected
          </span>
        {/if}
      </div>

      {#if filteredCourses.length === 0}
        <p class="ui:text-muted-foreground py-8 text-center text-sm">
          {courses.length === 0 ? 'Loading courses…' : $t('courses.course_card.empty_title')}
        </p>
      {:else}
        <div class="ui:border-border max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">
          {#each filteredCourses as course (course.id)}
            <div class="hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-1.5">
              <Checkbox
                id={`export-course-${course.id}`}
                checked={isSelected(course.id)}
                onCheckedChange={(checked) => toggleCourse(course.id, !!checked)}
              />
              <Label for={`export-course-${course.id}`} class="flex-1 cursor-pointer text-sm font-normal">
                {course.title}
              </Label>
              <span class="ui:text-muted-foreground text-xs tabular-nums">{course.lessonCount ?? 0} lessons</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex flex-wrap gap-3">
        <Button
          onclick={handleExportSelected}
          disabled={selectedCount === 0 || isLoadingExport}
          loading={isLoadingExport}
        >
          <DownloadIcon size={16} />
          {$t('courses.import_export.export_button', { count: selectedCount })}
        </Button>
        <Button
          variant="outline"
          onclick={handleExportAll}
          disabled={courses.length === 0 || isLoadingExport}
          loading={isLoadingExport && selectedCount === 0}
        >
          <DownloadIcon size={16} />
          {$t('courses.import_export.export_all_button')}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- ── Import section ── -->
  <Card.Root>
    <Card.Header>
      <Card.Title>{$t('courses.import_export.import_section_title')}</Card.Title>
      <Card.Description>{$t('courses.import_export.import_section_description')}</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4">
      <!-- File drop zone (multiple files) -->
      <Field.Field>
        <label
          for="import-file-input"
          class="ui:border-border ui:text-muted-foreground hover:border-primary/50 hover:text-primary flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors"
        >
          <UploadIcon size={32} />
          <span>{$t('courses.import_export.import_zone_label')}</span>
          <span class="ui:text-muted-foreground text-xs">{$t('courses.import_export.import_zone_hint')}</span>
          <input
            id="import-file-input"
            type="file"
            accept=".json"
            multiple
            class="hidden"
            disabled={isImporting}
            onchange={handleFilesSelected}
          />
        </label>
      </Field.Field>

      <!-- Import progress -->
      {#if isImporting}
        <div class="flex items-center gap-2 text-sm">
          <span class="ui:text-muted-foreground">
            {$t('courses.import_export.import_processing', {
              current: importProgress.current,
              total: importProgress.total
            })}
          </span>
        </div>
      {:else if importDoneCount > 0}
        <p class="ui:text-muted-foreground text-sm">
          {$t('courses.import_export.import_done', { count: importDoneCount })}
        </p>
      {/if}

      <!-- Draft list -->
      <div>
        <h4 class="mb-2 text-sm font-medium">{$t('courses.import_export.drafts_title')}</h4>

        {#if courseImportApi.drafts.length === 0}
          <p class="ui:text-muted-foreground py-4 text-center text-sm">
            {$t('courses.import_export.drafts_empty')}
          </p>
        {:else}
          <div class="ui:border-border max-h-96 space-y-1 overflow-y-auto rounded-lg border p-2">
            {#each activeDrafts as draft (draft.id)}
              <button
                onclick={() => openPreview(draft.id)}
                class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{draft.title}</p>
                  <p class="ui:text-muted-foreground mt-0.5 text-xs">
                    {#if draft.summary}
                      {@const s = draft.summary as Record<string, number>}
                      {$t('courses.import_export.preview_sections', { count: s.sectionCount ?? 0 })}
                      &middot;
                      {$t('courses.import_export.preview_lessons', { count: s.lessonCount ?? 0 })}
                      {#if s.exerciseCount}
                        &middot;
                        {$t('courses.import_export.preview_exercises', { count: s.exerciseCount })}
                      {/if}
                    {/if}
                  </p>
                </div>
                <Badge variant={statusVariant(draft.status)}>
                  {$t(`courses.import_export.drafts_status_${draft.status.toLowerCase()}`)}
                </Badge>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</div>

<!-- ── Preview Dialog ── -->
{#if previewDraft}
  <Dialog.Root
    open={!!previewDraftId}
    onOpenChange={(open) => {
      if (!open) closePreview();
    }}
  >
    <Dialog.Content class="w-full max-w-lg">
      <Dialog.Header>
        <Dialog.Title>
          {$t('courses.import_export.preview_title', { title: previewDraft.title })}
        </Dialog.Title>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        <!-- Status badge -->
        <div class="flex items-center gap-2">
          <Badge variant={statusVariant(previewDraft.status)}>
            {$t(`courses.import_export.drafts_status_${previewDraft.status.toLowerCase()}`)}
          </Badge>
          {#if previewDraft.publishedCourseId}
            <a
              href={resolve(`/courses/${previewDraft.publishedCourseId}`, {})}
              class="ui:text-primary inline-flex items-center gap-1 text-sm underline underline-offset-2"
            >
              {$t('courses.import_export.drafts_published_link')}
              <ExternalLinkIcon size={12} />
            </a>
          {/if}
        </div>

        <!-- Summary stats -->
        {#if previewSummary}
          <div class="ui:bg-muted/50 flex flex-wrap gap-4 rounded-lg p-3 text-sm">
            <div>
              <span class="ui:text-muted-foreground">{$t('courses.import_export.preview_type')}:</span>
              {' '}{courseImportApi.currentDraft
                ? (courseImportApi.currentDraft.draft as Record<string, unknown>).course
                  ? (((courseImportApi.currentDraft.draft as Record<string, unknown>).course as Record<string, unknown>)
                      .type as string)
                  : '—'
                : '—'}
            </div>
            <div>
              <span class="ui:text-muted-foreground">{$t('courses.import_export.preview_locale')}:</span>
              {' '}{draftLocaleDisplay(previewDraft.locale)}
            </div>
            <div>{$t('courses.import_export.preview_sections', { count: previewSummary.sectionCount ?? 0 })}</div>
            <div>{$t('courses.import_export.preview_lessons', { count: previewSummary.lessonCount ?? 0 })}</div>
            {#if previewSummary.exerciseCount}
              <div>{$t('courses.import_export.preview_exercises', { count: previewSummary.exerciseCount })}</div>
            {/if}
          </div>
        {/if}

        <!-- Full structure from currentDraft -->
        {#if courseImportApi.currentDraft}
          {@const draftData = courseImportApi.currentDraft.draft as {
            course?: { title?: string; description?: string; type?: string };
            sections?: Array<{ title: string }>;
            lessons?: Array<{ title: string }>;
            exercises?: Array<{ title: string }>;
            tags?: string[];
          }}

          {#if draftData.course?.description}
            <div>
              <p class="ui:text-muted-foreground text-xs font-medium tracking-wider uppercase">Description</p>
              <p class="mt-1 line-clamp-3 text-sm">{draftData.course.description}</p>
            </div>
          {/if}

          {#if draftData.sections && draftData.sections.length > 0}
            <div>
              <p class="ui:text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
                {$t('courses.import_export.preview_sections', { count: draftData.sections.length })}
              </p>
              <ul class="ui:border-border max-h-40 space-y-0.5 overflow-y-auto rounded border p-2 text-sm">
                {#each draftData.sections as section}
                  <li class="truncate">{section.title}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if draftData.tags && draftData.tags.length > 0}
            <div>
              <p class="ui:text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
                {$t('courses.import_export.preview_tags')}
              </p>
              <div class="flex flex-wrap gap-1">
                {#each draftData.tags as tag}
                  <Badge variant="outline">{tag}</Badge>
                {/each}
              </div>
            </div>
          {/if}

          {#if previewSummary?.warningCount}
            <div class="ui:text-warning text-sm">
              {$t('courses.import_export.preview_warnings', { count: previewSummary.warningCount })}
            </div>
          {/if}
        {/if}
      </div>

      <div class="mt-5 flex flex-row-reverse items-center gap-2">
        {#if previewDraft.status === 'DRAFT'}
          <Button onclick={handlePublish} disabled={isPublishing || isDeleting} loading={isPublishing}>
            {$t('courses.import_export.publish_button')}
          </Button>
          <Button
            variant="outline"
            class="ui:text-destructive"
            onclick={handleDeleteDraft}
            disabled={isPublishing || isDeleting}
            loading={isDeleting}
          >
            <TrashIcon size={14} />
            {$t('courses.import_export.delete_draft_button')}
          </Button>
        {/if}
        <Button variant="ghost" onclick={closePreview}>Close</Button>
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}
