<script lang="ts">
  import * as Page from '@cio/ui/base/page';
  import { Button } from '@cio/ui/base/button';
  import * as Select from '@cio/ui/base/select';
  import * as Field from '@cio/ui/base/field';
  import * as RadioGroup from '@cio/ui/base/radio-group';
  import { Input } from '@cio/ui/base/input';
  import { IconButton } from '@cio/ui/custom/icon-button';
  import TrashIcon from '@lucide/svelte/icons/trash';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { currentOrg } from '$lib/utils/store/org';
  import { t } from '$lib/utils/functions/translations';
  import { aiProviderApi } from '../api/ai-provider.svelte';
  import { CtrlSaveShortcut } from '$features/settings/components';
  import type { AiProviderProfile, OrgAiProviderSettings } from '../utils/types';

  const PROVIDER_OPTIONS = [
    { value: 'openai', labelKey: 'settings.ai_provider.provider_options.openai' },
    { value: 'anthropic', labelKey: 'settings.ai_provider.provider_options.anthropic' },
    { value: 'google', labelKey: 'settings.ai_provider.provider_options.google' },
    { value: 'moonshot', labelKey: 'settings.ai_provider.provider_options.moonshot' },
    { value: 'deepseek', labelKey: 'settings.ai_provider.provider_options.deepseek' }
  ] as const;

  let initialized = $state(false);
  let isUsingDefaults = $state(true);
  let profiles = $state<AiProviderProfile[]>([]);

  // Guard: only fetch settings once the org context is available.
  // The API client reads currentOrg.id for the cio-org-id header;
  // calling fetchSettings before org init causes ORG_ID_REQUIRED errors.
  let initialisedOnce = false;
  $effect(() => {
    if (!$currentOrg.id || initialisedOnce) return;
    initialisedOnce = true;

    aiProviderApi.fetchSettings().then(() => {
      applySettings(aiProviderApi.settings);
      initialized = true;
    });
  });

  function applySettings(settings: OrgAiProviderSettings | null) {
    profiles = (settings?.profiles ?? []).map((profile) => ({ ...profile, apiKey: profile.apiKey ?? '' }));
    isUsingDefaults = settings?.isDefault ?? true;
  }

  function addProfile() {
    profiles = [
      ...profiles,
      {
        id: crypto.randomUUID(),
        name: '',
        provider: 'openai',
        apiKey: '',
        isDefault: profiles.length === 0
      }
    ];
  }

  function removeProfile(id: string) {
    const next = profiles.filter((profile) => profile.id !== id);

    // Keep exactly one default when the removed profile was the default.
    if (next.length > 0 && !next.some((profile) => profile.isDefault)) {
      next[0].isDefault = true;
    }

    profiles = next;
  }

  function setDefaultProfile(id: string) {
    profiles = profiles.map((profile) => ({ ...profile, isDefault: profile.id === id }));
  }

  function providerLabel(provider: string): string {
    const option = PROVIDER_OPTIONS.find((opt) => opt.value === provider);
    return option ? t.get(option.labelKey) : provider;
  }

  async function handleSave() {
    const payload = profiles.map(({ id, name, provider, baseURL, apiKey, model, isDefault }) => ({
      id,
      name,
      provider,
      baseURL: baseURL || undefined,
      apiKey: apiKey || undefined,
      model: model || undefined,
      isDefault
    }));

    await aiProviderApi.updateSettings(payload);
    if (aiProviderApi.settings) {
      applySettings(aiProviderApi.settings);
    }
  }

  async function handleReset() {
    await aiProviderApi.resetSettings();
    if (aiProviderApi.settings) {
      applySettings(aiProviderApi.settings);
    }
  }
</script>

<Page.Root class="mx-auto flex w-[90%] px-4 md:max-w-2xl lg:max-w-3xl">
  <CtrlSaveShortcut onSave={handleSave} />

  <Page.Header isSticky class="ui:bg-background z-10">
    <Page.HeaderContent>
      <Page.Title>{$t('settings.ai_provider.heading')}</Page.Title>
      <Page.Subtitle>{$t('settings.ai_provider.page_subtitle')}</Page.Subtitle>
    </Page.HeaderContent>
    <Page.Action>
      <Button
        loading={aiProviderApi.saving}
        disabled={aiProviderApi.saving || !initialized || profiles.length === 0}
        onclick={handleSave}
      >
        {$t('settings.ai_provider.save')}
      </Button>
    </Page.Action>
  </Page.Header>

  <Page.Body>
    {#snippet child()}
      {#if !initialized}
        <p class="ui:text-muted-foreground text-sm">{$t('settings.ai_provider.loading')}</p>
      {:else if profiles.length === 0}
        <p class="ui:text-muted-foreground text-sm">{$t('settings.ai_provider.empty')}</p>
      {:else}
        <Field.Group>
          <Field.Set>
            <Field.Legend>{$t('settings.ai_provider.profiles_heading')}</Field.Legend>
            {#if isUsingDefaults}
              <Field.Description>{$t('settings.ai_provider.using_defaults_note')}</Field.Description>
            {/if}
            <Field.Description>{$t('settings.ai_provider.default_hint')}</Field.Description>

            <RadioGroup.Root
              value={profiles.find((profile) => profile.isDefault)?.id ?? ''}
              onValueChange={(value) => value && setDefaultProfile(value)}
              class="gap-4"
            >
              {#each profiles as profile (profile.id)}
                <div class="rounded-lg border p-4">
                  <div class="flex flex-wrap items-start gap-3">
                    <Field.Field class="min-w-40 flex-1">
                      <Field.Label>{$t('settings.ai_provider.name_label')}</Field.Label>
                      <Input bind:value={profile.name} placeholder={$t('settings.ai_provider.name_placeholder')} />
                    </Field.Field>

                    <Field.Field class="min-w-40 flex-1">
                      <Field.Label>{$t('settings.ai_provider.provider_label')}</Field.Label>
                      <Select.Root
                        type="single"
                        value={profile.provider}
                        onValueChange={(value) =>
                          value !== undefined && (profile.provider = value as AiProviderProfile['provider'])}
                      >
                        <Select.Trigger>{providerLabel(profile.provider)}</Select.Trigger>
                        <Select.Content>
                          {#each PROVIDER_OPTIONS as opt (opt.value)}
                            <Select.Item value={opt.value} label={$t(opt.labelKey)}>
                              {$t(opt.labelKey)}
                            </Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </Field.Field>

                    <IconButton
                      size="icon"
                      type="button"
                      aria-label={$t('settings.ai_provider.delete_profile')}
                      tooltip={$t('settings.ai_provider.delete_profile')}
                      onclick={() => removeProfile(profile.id)}
                    >
                      <TrashIcon class="size-4" />
                    </IconButton>
                  </div>

                  <Field.Group class="mt-4">
                    <Field.Field>
                      <Field.Label>{$t('settings.ai_provider.api_key_label')}</Field.Label>
                      <Input
                        type="password"
                        placeholder={$t('settings.ai_provider.api_key_placeholder')}
                        bind:value={profile.apiKey}
                        autocomplete="off"
                      />
                      <Field.Description>
                        {$t('settings.ai_provider.api_key_description', {
                          provider: providerLabel(profile.provider)
                        })}
                      </Field.Description>
                    </Field.Field>

                    <Field.Field>
                      <Field.Label>{$t('settings.ai_provider.base_url_label')}</Field.Label>
                      <Input
                        type="url"
                        placeholder={$t('settings.ai_provider.base_url_placeholder')}
                        bind:value={profile.baseURL}
                      />
                      <Field.Description>{$t('settings.ai_provider.base_url_description')}</Field.Description>
                    </Field.Field>

                    <Field.Field>
                      <Field.Label>{$t('settings.ai_provider.model_label')}</Field.Label>
                      <Input placeholder={$t('settings.ai_provider.model_placeholder')} bind:value={profile.model} />
                      <Field.Description>{$t('settings.ai_provider.model_description')}</Field.Description>
                    </Field.Field>

                    <Field.Field orientation="horizontal">
                      <RadioGroup.Item value={profile.id} aria-label={$t('settings.ai_provider.is_default_label')} />
                      <Field.Label>{$t('settings.ai_provider.is_default_label')}</Field.Label>
                    </Field.Field>
                  </Field.Group>
                </div>
              {/each}
            </RadioGroup.Root>

            <Button variant="secondary" onclick={addProfile}>
              <PlusIcon class="size-4" />
              {$t('settings.ai_provider.add_profile')}
            </Button>
          </Field.Set>

          <Field.Separator />

          <Field.Set>
            <Field.Legend>{$t('settings.ai_provider.reset_heading')}</Field.Legend>
            <Field.Field orientation="horizontal">
              <Button
                variant="secondary"
                onclick={handleReset}
                loading={aiProviderApi.saving}
                disabled={aiProviderApi.saving || !initialized || isUsingDefaults}
              >
                {$t('settings.ai_provider.reset')}
              </Button>
              <Field.Description>{$t('settings.ai_provider.reset_description')}</Field.Description>
            </Field.Field>
          </Field.Set>
        </Field.Group>
      {/if}
    {/snippet}
  </Page.Body>
</Page.Root>
