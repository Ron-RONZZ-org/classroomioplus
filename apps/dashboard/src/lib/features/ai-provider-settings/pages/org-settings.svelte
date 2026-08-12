<script lang="ts">
  import * as Page from '@cio/ui/base/page';
  import * as Accordion from '@cio/ui/base/accordion';
  import * as Field from '@cio/ui/base/field';
  import { Badge } from '@cio/ui/base/badge';
  import { Button } from '@cio/ui/base/button';
  import { currentOrg } from '$lib/utils/store/org';
  import { t } from '$lib/utils/functions/translations';
  import { aiProviderApi } from '../api/ai-provider.svelte';
  import ConfirmDialog from '../components/confirm-dialog.svelte';
  import ProviderFormDialog from '../components/provider-form-dialog.svelte';
  import ProfileFormDialog from '../components/profile-form-dialog.svelte';
  import type { AiProfileRole, OrgAiProfile, OrgAiProvider } from '../utils/types';

  let initialized = $state(false);

  // Guard: only fetch settings once the org context is available.
  // The API client reads currentOrg.id for the cio-org-id header;
  // calling fetchManagement before org init causes ORG_ID_REQUIRED errors.
  let initialisedOnce = false;
  $effect(() => {
    if (!$currentOrg.id || initialisedOnce) return;
    initialisedOnce = true;

    aiProviderApi.fetchManagement().then(() => {
      initialized = true;
    });
  });

  const providers = $derived(aiProviderApi.data?.providers ?? []);
  const profiles = $derived(aiProviderApi.data?.profiles ?? []);

  // Expandable list state: only names visible at root level.
  let openProviders = $state<string[]>([]);
  let openProfiles = $state<string[]>([]);

  // Provider form dialog.
  let providerDialogOpen = $state(false);
  let editingProvider = $state<OrgAiProvider | null>(null);

  // Profile form dialog.
  let profileDialogOpen = $state(false);
  let editingProfile = $state<OrgAiProfile | null>(null);

  // Destructive-action confirmations.
  let deletingProvider = $state<OrgAiProvider | null>(null);
  let deletingProfile = $state<OrgAiProfile | null>(null);
  let resettingProfile = $state<OrgAiProfile | null>(null);

  function openNewProvider() {
    editingProvider = null;
    providerDialogOpen = true;
  }

  function openEditProvider(provider: OrgAiProvider) {
    editingProvider = provider;
    providerDialogOpen = true;
  }

  function openNewProfile() {
    editingProfile = null;
    profileDialogOpen = true;
  }

  function openEditProfile(profile: OrgAiProfile) {
    editingProfile = profile;
    profileDialogOpen = true;
  }

  async function handleSaveProvider(input: Parameters<typeof aiProviderApi.createProvider>[0]) {
    if (editingProvider) {
      await aiProviderApi.updateProvider(editingProvider.id, input);
    } else {
      await aiProviderApi.createProvider(input);
    }
    providerDialogOpen = false;
  }

  async function handleSaveProfile(input: Parameters<typeof aiProviderApi.createProfile>[0]) {
    if (editingProfile) {
      await aiProviderApi.updateProfile(editingProfile.id, input);
    } else {
      await aiProviderApi.createProfile(input);
    }
    profileDialogOpen = false;
  }

  async function handleDeleteProvider() {
    if (!deletingProvider) return;
    await aiProviderApi.deleteProvider(deletingProvider.id);
    deletingProvider = null;
  }

  async function handleDeleteProfile() {
    if (!deletingProfile) return;
    await aiProviderApi.deleteProfile(deletingProfile.id);
    deletingProfile = null;
  }

  /** Restores the profile's base URL to its provider default and clears the model. */
  async function handleResetProfile() {
    if (!resettingProfile) return;
    const provider = providers.find((p) => p.id === resettingProfile.providerId);
    await aiProviderApi.updateProfile(resettingProfile.id, {
      baseURL: provider?.defaultBaseUrl ?? '',
      model: ''
    });
    resettingProfile = null;
  }

  async function handleActivate(profileId: string, role: AiProfileRole) {
    await aiProviderApi.activateProfile(profileId, role);
  }

  function activeRoles(profileId: string): AiProfileRole[] {
    const active = aiProviderApi.data?.activeProfileByRole ?? {};
    const roles: AiProfileRole[] = [];
    if (active.teacher === profileId) roles.push('teacher');
    if (active.student === profileId) roles.push('student');
    return roles;
  }

  function providerName(providerId: string): string {
    return providers.find((p) => p.id === providerId)?.name ?? '—';
  }
</script>

<Page.Root class="mx-auto flex w-[90%] px-4 md:max-w-2xl lg:max-w-3xl">
  <Page.Header isSticky class="ui:bg-background z-10">
    <Page.HeaderContent>
      <Page.Title>{$t('settings.ai_provider.heading')}</Page.Title>
      <Page.Subtitle>{$t('settings.ai_provider.subtitle')}</Page.Subtitle>
    </Page.HeaderContent>
  </Page.Header>

  <Page.Body>
    {#snippet child()}
      {#if !initialized}
        <p class="ui:text-muted-foreground text-sm">{$t('settings.ai_provider.loading')}</p>
      {:else}
        <Field.Group>
          <Field.Set>
            <Field.Legend>{$t('settings.ai_provider.providers_heading')}</Field.Legend>
            <Field.Description>{$t('settings.ai_provider.providers_subtitle')}</Field.Description>

            <div class="flex justify-end">
              <Button variant="secondary" onclick={openNewProvider}>
                {$t('settings.ai_provider.add_provider')}
              </Button>
            </div>

            {#if providers.length === 0}
              <p class="ui:text-muted-foreground text-sm">{$t('settings.ai_provider.no_providers')}</p>
            {:else}
              <Accordion.Root
                type="multiple"
                bind:value={openProviders}
                class="ui:border-border divide-y rounded-lg border"
              >
                {#each providers as provider (provider.id)}
                  <Accordion.Item value={provider.id} class="px-4 last:border-none">
                    <Accordion.Trigger class="hover:no-underline">
                      <span class="flex w-full items-center justify-between gap-2">
                        <span class="font-medium">{provider.name}</span>
                        <Badge variant="secondary">{provider.providerType}</Badge>
                      </span>
                    </Accordion.Trigger>
                    <Accordion.Content>
                      <div class="space-y-4 pb-3">
                        <Field.Field>
                          <Field.Label>{$t('settings.ai_provider.provider_type')}</Field.Label>
                          <p class="ui:text-muted-foreground text-sm">{provider.providerType}</p>
                        </Field.Field>

                        <Field.Field>
                          <Field.Label>{$t('settings.ai_provider.default_base_url')}</Field.Label>
                          <p class="ui:text-muted-foreground text-sm">
                            {provider.defaultBaseUrl ?? $t('settings.ai_provider.empty_base_url')}
                          </p>
                        </Field.Field>

                        <div class="flex items-center justify-end gap-2">
                          <Button variant="outline" onclick={() => openEditProvider(provider)}>
                            {$t('settings.ai_provider.edit')}
                          </Button>
                          <Button variant="outline" onclick={() => (deletingProvider = provider)}>
                            {$t('settings.ai_provider.delete')}
                          </Button>
                        </div>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                {/each}
              </Accordion.Root>
            {/if}
          </Field.Set>

          <Field.Separator />

          <Field.Set>
            <Field.Legend>{$t('settings.ai_provider.profiles_heading')}</Field.Legend>
            <Field.Description>{$t('settings.ai_provider.profiles_subtitle')}</Field.Description>

            <div class="flex justify-end">
              <Button variant="secondary" onclick={openNewProfile}>
                {$t('settings.ai_provider.add_profile')}
              </Button>
            </div>

            {#if profiles.length === 0}
              <p class="ui:text-muted-foreground text-sm">{$t('settings.ai_provider.no_profiles')}</p>
            {:else}
              <Accordion.Root
                type="multiple"
                bind:value={openProfiles}
                class="ui:border-border divide-y rounded-lg border"
              >
                {#each profiles as profile (profile.id)}
                  <Accordion.Item value={profile.id} class="px-4 last:border-none">
                    <Accordion.Trigger class="hover:no-underline">
                      <span class="flex w-full items-center justify-between gap-2">
                        <span class="font-medium">{profile.name}</span>
                        <span class="flex items-center gap-1.5">
                          {#if activeRoles(profile.id).includes('teacher')}
                            <Badge>{$t('settings.ai_provider.teacher_badge')}</Badge>
                          {/if}
                          {#if activeRoles(profile.id).includes('student')}
                            <Badge>{$t('settings.ai_provider.student_badge')}</Badge>
                          {/if}
                        </span>
                      </span>
                    </Accordion.Trigger>
                    <Accordion.Content>
                      <div class="space-y-4 pb-3">
                        <Field.Field>
                          <Field.Label>{$t('settings.ai_provider.provider')}</Field.Label>
                          <p class="ui:text-muted-foreground text-sm">{providerName(profile.providerId)}</p>
                        </Field.Field>

                        <Field.Field>
                          <Field.Label>{$t('settings.ai_provider.api_key')}</Field.Label>
                          <p class="ui:text-muted-foreground text-sm">
                            {profile.apiKey ? '••••••••' : $t('settings.ai_provider.api_key_empty')}
                          </p>
                        </Field.Field>

                        <Field.Field>
                          <Field.Label>{$t('settings.ai_provider.base_url')}</Field.Label>
                          <p class="ui:text-muted-foreground text-sm">
                            {profile.baseURL ?? $t('settings.ai_provider.empty_base_url')}
                          </p>
                        </Field.Field>

                        <Field.Field>
                          <Field.Label>{$t('settings.ai_provider.model')}</Field.Label>
                          <p class="ui:text-muted-foreground text-sm">
                            {profile.model ?? $t('settings.ai_provider.model_empty')}
                          </p>
                        </Field.Field>

                        <div class="flex flex-wrap items-center justify-end gap-2">
                          {#if !activeRoles(profile.id).includes('teacher')}
                            <Button variant="outline" onclick={() => handleActivate(profile.id, 'teacher')}>
                              {$t('settings.ai_provider.set_teacher')}
                            </Button>
                          {/if}
                          {#if !activeRoles(profile.id).includes('student')}
                            <Button variant="outline" onclick={() => handleActivate(profile.id, 'student')}>
                              {$t('settings.ai_provider.set_student')}
                            </Button>
                          {/if}
                          <Button variant="outline" onclick={() => (resettingProfile = profile)}>
                            {$t('settings.ai_provider.reset_to_default')}
                          </Button>
                          <Button variant="outline" onclick={() => openEditProfile(profile)}>
                            {$t('settings.ai_provider.edit')}
                          </Button>
                          <Button variant="outline" onclick={() => (deletingProfile = profile)}>
                            {$t('settings.ai_provider.delete')}
                          </Button>
                        </div>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                {/each}
              </Accordion.Root>
            {/if}
          </Field.Set>
        </Field.Group>
      {/if}
    {/snippet}
  </Page.Body>
</Page.Root>

<ProviderFormDialog
  bind:open={providerDialogOpen}
  {editingProvider}
  saving={aiProviderApi.saving}
  onSave={handleSaveProvider}
/>

<ProfileFormDialog
  bind:open={profileDialogOpen}
  {editingProfile}
  {providers}
  saving={aiProviderApi.saving}
  onSave={handleSaveProfile}
/>

<ConfirmDialog
  open={deletingProvider !== null}
  title={$t('settings.ai_provider.delete_provider_title')}
  message={$t('settings.ai_provider.delete_provider_message', { name: deletingProvider?.name ?? '' })}
  confirmLabel={$t('settings.ai_provider.delete')}
  loading={aiProviderApi.saving}
  onConfirm={handleDeleteProvider}
  onClose={() => (deletingProvider = null)}
/>

<ConfirmDialog
  open={deletingProfile !== null}
  title={$t('settings.ai_provider.delete_profile_title')}
  message={$t('settings.ai_provider.delete_profile_message', { name: deletingProfile?.name ?? '' })}
  confirmLabel={$t('settings.ai_provider.delete')}
  loading={aiProviderApi.saving}
  onConfirm={handleDeleteProfile}
  onClose={() => (deletingProfile = null)}
/>

<ConfirmDialog
  open={resettingProfile !== null}
  title={$t('settings.ai_provider.reset_profile_title')}
  message={$t('settings.ai_provider.reset_profile_message', { name: resettingProfile?.name ?? '' })}
  confirmLabel={$t('settings.ai_provider.reset_to_default')}
  loading={aiProviderApi.saving}
  onConfirm={handleResetProfile}
  onClose={() => (resettingProfile = null)}
/>
