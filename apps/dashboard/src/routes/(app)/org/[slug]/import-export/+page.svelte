<script lang="ts">
  import ImportExportPage from '$features/org/pages/import-export.svelte';
  import * as Page from '@cio/ui/base/page';
  import { t } from '$lib/utils/functions/translations';

  let { data } = $props();
</script>

<Page.Root class="mx-auto w-full max-w-3xl px-4">
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{$t('courses.import_export.page_title')}</Page.Title>
      <Page.Subtitle>{$t('courses.import_export.page_subtitle')}</Page.Subtitle>
    </Page.HeaderContent>
  </Page.Header>
  <Page.Body>
    <ImportExportPage />
  </Page.Body>
</Page.Root>
