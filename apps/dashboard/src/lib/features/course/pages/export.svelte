<script lang="ts">
  import DownloadIcon from '@lucide/svelte/icons/download';
  import { Button } from '@cio/ui/base/button';
  import * as Page from '@cio/ui/base/page';
  import { t } from '$lib/utils/functions/translations';
  import { courseExportApi, courseApi } from '$features/course/api';
  import { snackbar } from '$features/ui/snackbar/store';

  const course = $derived(courseApi.course);

  async function handleExport() {
    if (!course?.id || !course?.title) return;

    const result = await courseExportApi.exportCourse(course.id, course.title);
    if (courseExportApi.success) {
      snackbar.success($t('course.navItem.export.success'));
    } else {
      snackbar.error($t('course.navItem.export.error'));
    }
  }

  const isLoading = $derived(courseExportApi.isLoading);
</script>

<Page.Root class="mx-auto w-full max-w-lg px-4">
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{$t('course.navItem.export.title')}</Page.Title>
      <p class="ui:text-muted-foreground text-sm">{$t('course.navItem.export.description')}</p>
    </Page.HeaderContent>
  </Page.Header>
  <Page.Body>
    {#if course}
      <div class="space-y-6">
        <div class="ui:border-border rounded-lg border p-4">
          <h3 class="font-medium">{course.title}</h3>
          {#if course.description}
            <p class="ui:text-muted-foreground mt-1 line-clamp-2 text-sm">{course.description}</p>
          {/if}
        </div>

        <Button onclick={handleExport} disabled={isLoading} loading={isLoading} class="w-fit">
          <DownloadIcon size={16} />
          {$t('course.navItem.export.button')}
        </Button>
      </div>
    {:else}
      <p class="ui:text-muted-foreground text-sm">{$t('course.navItem.not_permitted.body')}</p>
    {/if}
  </Page.Body>
</Page.Root>
