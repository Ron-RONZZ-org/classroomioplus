<script lang="ts">
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';

  import { Snackbar } from '$features/ui';
  import { appInitApi } from '$features/app/init.svelte';
  import PendingInviteModal from '$features/lms/components/pending-invite-modal.svelte';
  import { resolveAppOrgParams } from '$features/app/resolve-app-org-params';
  import { setupAnalytics } from '$lib/utils/functions/appSetup';
  import { globalStore } from '$lib/utils/store/app';
  import { currentOrg, mergeAccountOrgFromServer } from '$lib/utils/store/org';
  import { get } from 'svelte/store';
  import { user } from '$lib/utils/store/user';
  import { setTheme } from '$lib/utils/functions/theme';
  import { authClient } from '$lib/utils/services/auth/client';
  import merge from 'lodash/merge';
  import { MetaTags } from 'svelte-meta-tags';
  import AppModeWatcher from '$features/app/app-mode-watcher.svelte';
  import OrgSiteFavicon from '$features/app/org-site-favicon.svelte';

  import '../app.css';

  import { setUploadLimitsContext } from '$lib/utils/config/upload-limits-context';

  let { data, children } = $props();

  setUploadLimitsContext(data.uploadLimits);

  const metaTags = $derived(merge(data.baseMetaTags, page.data.pageMetaTags));

  onMount(() => {
    console.log('Layout', data);

    const sessionUser = data?.locals?.user;
    setupAnalytics(sessionUser ? { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name } : undefined);

    if (data?.locals?.user) {
      user.set({
        ...$user,
        isLoggedIn: true,
        currentSession: data.locals.user
      });
    }
  });

  $effect(() => {
    if (!data.isOrgSite || !data.org) {
      $globalStore.isOrgSite = false;
      $globalStore.orgSiteName = '';
      return;
    }

    $globalStore.orgSiteName = data.orgSiteName || '';
    $globalStore.isOrgSite = true;

    const existingOrg = get(currentOrg);
    const shouldSetPublicOrg =
      !existingOrg.id || existingOrg.siteName !== data.org.siteName || existingOrg.roleId === 0;

    if (shouldSetPublicOrg) {
      currentOrg.set(mergeAccountOrgFromServer(data.org));
    }

    setTheme(data.org.theme || 'blue');
  });

  const session = authClient.useSession();
  const appOrgParams = $derived(resolveAppOrgParams(data, page.url.pathname, page.params.slug));

  // Tracks whether setupApp has been called for the current session.
  // Plain boolean — deliberately NOT $state, so setting it doesn't cause
  // reactive cascading effects.
  let appInitAttempted = false;

  /*
    Auth + org context for the whole dashboard.

    Uses untrack() around appInitApi calls so this effect only re-runs when
    $session.data or appOrgParams changes — NOT when appInitApi internals
    (loading/initialized) change during the setup process. This prevents
    the effect from re-firing on every Better Auth background session poll
    (which toggles isPending/isRefetching) and on every setupApp loading
    state transition, avoiding reactive cascades.
  */
  $effect(() => {
    const sessionData = $session.data;
    const params = appOrgParams;

    untrack(() => {
      if (!sessionData) return;

      if (!appInitAttempted) {
        appInitAttempted = true;
        appInitApi.setupApp(sessionData as App.Locals, params);
        return;
      }

      void appInitApi.syncOrgContext(params);
    });
  });
</script>

{#if data.isOrgSite}
  <OrgSiteFavicon org={data.org} />
{/if}

<svelte:head>
  {#if !data.isOrgSite}
    <link rel="icon" type="image/png" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="32x32" href="/logo-32.png" />
  {/if}
</svelte:head>

<div>
  <AppModeWatcher />

  <MetaTags {...metaTags} />

  <Snackbar />

  {#if appInitApi.pendingOrgInvite}
    <PendingInviteModal
      bind:open={appInitApi.showPendingInviteModal}
      invite={appInitApi.pendingOrgInvite}
      onAccepted={(redirectTo) => appInitApi.handlePendingInviteAccepted(redirectTo)}
    />
  {/if}

  {@render children?.()}
</div>

<style>
  :global(:root) {
    --main-primary-color: rgba(29, 78, 216, 1);
    --border-color: #eaecef;
  }

  :global(.dark svg.dark) {
    fill: #fff;
  }

  :global(.border-c) {
    border: 1px solid var(--border-color);
  }

  :global(.border-bottom-c) {
    border-bottom: 1px solid var(--border-color);
  }

  :global(.cards-container) {
    width: 90%;
    margin: 0 auto;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    column-gap: 12px;
    row-gap: 12px;
  }

  @media screen and (max-width: 768px) {
    :global(.cards-container) {
      width: 95%;
      margin: 0 auto;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      column-gap: 12px;
      row-gap: 12px;
    }
  }
</style>
