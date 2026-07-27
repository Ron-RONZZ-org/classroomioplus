<script lang="ts">
  import { Button, type ButtonProps } from '@cio/ui/base/button';
  import { t } from '$lib/utils/functions/translations';
  import { isOrgAdmin } from '$lib/utils/store/org';
  import UploadIcon from '@lucide/svelte/icons/upload';
  import { goto } from '$app/navigation';
  import { currentOrgPath } from '$lib/utils/store/org';
  import { isMobileStore } from '@cio/ui/hooks/is-mobile.svelte';

  let {
    variant = 'outline',
    isResponsive = false
  }: ButtonProps & {
    isResponsive?: boolean;
  } = $props();

  function onClick() {
    goto(`${$currentOrgPath}/import-export`);
  }
</script>

{#if isResponsive && isMobileStore.current}
  <Button variant="outline" size="icon" disabled={!$isOrgAdmin} onclick={onClick}>
    <UploadIcon size={16} />
  </Button>
{:else}
  <Button {variant} onclick={onClick} disabled={!$isOrgAdmin}>
    <UploadIcon size={16} />
    {$t('courses.heading_import_button')}
  </Button>
{/if}
