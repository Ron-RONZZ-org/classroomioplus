<script lang="ts">
  import * as Avatar from '@cio/ui/base/avatar';
  import * as Sidebar from '@cio/ui/base/sidebar';
  import * as Breadcrumb from '@cio/ui/base/breadcrumb';
  import { Skeleton } from '@cio/ui/base/skeleton';
  import { shortenName } from '$lib/utils/functions/string';

  import { currentOrg, currentOrgPath } from '$lib/utils/store/org';

  const sidebar = useSidebar();

  import { useSidebar } from '@cio/ui/base/sidebar';

  interface Props {
    variant?: 'sidebar' | 'breadcrumb';
  }

  let { variant = 'sidebar' }: Props = $props();
</script>

{#if variant === 'breadcrumb'}
  <Breadcrumb.Link href={$currentOrgPath} class="flex items-center gap-2">
    {#if $currentOrg.name}
      <Avatar.Root class="flex size-6! items-center justify-center rounded-md!">
        <Avatar.Image src={$currentOrg.avatarUrl} alt={$currentOrg.name} />
        <Avatar.Fallback class="rounded-md! text-xs">{shortenName($currentOrg.name)}</Avatar.Fallback>
      </Avatar.Root>
      <span class="hidden truncate text-sm font-medium md:block">{$currentOrg.name}</span>
    {:else}
      <Skeleton class="h-4 w-24" />
    {/if}
  </Breadcrumb.Link>
{:else}
  <Sidebar.Menu>
    <Sidebar.MenuItem>
      <div class="flex items-center gap-3 px-2 py-1.5">
        {#if $currentOrg.name}
          <Avatar.Root class="ui:flex ui:size-8 ui:items-center ui:justify-center ui:rounded-lg">
            <Avatar.Image src={$currentOrg.avatarUrl} alt={$currentOrg.name} />
            <Avatar.Fallback class="rounded-lg">{shortenName($currentOrg.name)}</Avatar.Fallback>
          </Avatar.Root>
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-normal">{$currentOrg.name}</span>
            <span class="truncate text-xs">{$currentOrg.plans?.[0]?.planName || 'Free'}</span>
          </div>
        {:else}
          <Skeleton class="h-full w-full" />
        {/if}
      </div>
    </Sidebar.MenuItem>
  </Sidebar.Menu>
{/if}
