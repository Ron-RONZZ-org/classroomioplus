<script lang="ts">
  import * as Page from '@cio/ui/base/page';
  import { Button } from '@cio/ui/base/button';
  import * as Select from '@cio/ui/base/select';
  import * as Field from '@cio/ui/base/field';
  import { Input } from '@cio/ui/base/input';
  import { currentOrg } from '$lib/utils/store/org';
  import { t } from '$lib/utils/functions/translations';
  import { aiProviderApi } from '../api/ai-provider.svelte';
  import type { OrgAiProviderSettings } from '../utils/types';

  const PROVIDER_OPTIONS = [
    { value: '', label: '— Default (env vars) —' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'moonshot', label: 'Moonshot' },
    { value: 'deepseek', label: 'DeepSeek' }
  ] as const;

  let initialized = $state(false);

  /** Draft form state, initialised once from the API response. */
  let provider = $state('');
  let apiKey = $state('');
  let baseURL = $state('');
  let model = $state('');

  function applySettings(s: OrgAiProviderSettings | null) {
    provider = s?.provider ?? '';
    apiKey = s?.apiKey ?? '';
    baseURL = s?.baseURL ?? '';
    model = s?.model ?? '';
  }

  /** Whether the selected provider supports custom baseURL / model. */
  const showCustomFields = $derived(provider === 'openai' || provider === 'deepseek');

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

  async function handleSave() {
    const patch: Record<string, unknown> = {};

    if (provider) {
      patch.provider = provider;
      patch.apiKey = apiKey || undefined;
      patch.baseURL = baseURL || undefined;
      patch.model = model || undefined;
    } else {
      // Clearing the selection removes the override; the system falls back to env vars.
      patch.provider = '';
    }

    await aiProviderApi.updateSettings(patch as Partial<OrgAiProviderSettings>);
  }

  function handleReset() {
    applySettings(null);
  }
</script>

<Page.Root class="mx-auto flex w-[90%] px-4 md:max-w-2xl lg:max-w-3xl">
  <Page.Header isSticky class="ui:bg-background z-10">
    <Page.HeaderContent>
      <Page.Title>AI Provider</Page.Title>
      <Page.Subtitle>
        Configure which AI provider this workspace uses. When unset, the system falls back to environment variables.
      </Page.Subtitle>
    </Page.HeaderContent>
    <Page.Action>
      <Button loading={aiProviderApi.saving} disabled={aiProviderApi.saving || !initialized} onclick={handleSave}>
        Save
      </Button>
    </Page.Action>
  </Page.Header>

  <Page.Body>
    {#snippet child()}
      {#if !initialized}
        <p class="ui:text-muted-foreground text-sm">Loading…</p>
      {:else}
        <Field.Group>
          <Field.Set>
            <Field.Legend>Provider</Field.Legend>

            <Field.Field>
              <Field.Label>AI Provider</Field.Label>
              <Select.Root type="single" {provider} onValueChange={(v) => v !== undefined && (provider = v)}>
                <Select.Trigger>
                  {PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? 'Select…'}
                </Select.Trigger>
                <Select.Content>
                  {#each PROVIDER_OPTIONS as opt (opt.value)}
                    <Select.Item value={opt.value} label={opt.label}>
                      {opt.label}
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Field.Description>
                Choose a provider to override env-var defaults. Select "Default (env vars)" to use environment
                variables.
              </Field.Description>
            </Field.Field>

            {#if provider}
              <Field.Field>
                <Field.Label>API Key</Field.Label>
                <Input type="password" placeholder="sk-..." bind:value={apiKey} />
                <Field.Description>
                  API key for the selected provider. Stored in the database; leave empty to use the environment
                  variable.
                </Field.Description>
              </Field.Field>
            {/if}

            {#if showCustomFields}
              <Field.Field>
                <Field.Label>Base URL</Field.Label>
                <Input
                  type="url"
                  placeholder={provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'}
                  bind:value={baseURL}
                />
                <Field.Description>
                  Leave empty to use the provider's default endpoint or the {provider === 'deepseek'
                    ? 'DEEPSEEK_BASE_URL'
                    : 'OPENAI_BASE_URL'} env var.
                </Field.Description>
              </Field.Field>

              <Field.Field>
                <Field.Label>Model</Field.Label>
                <Input placeholder={provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'} bind:value={model} />
                <Field.Description>
                  Model identifier. Leave empty to use the default model for this provider.
                </Field.Description>
              </Field.Field>
            {/if}
          </Field.Set>

          <Field.Separator />

          <Field.Set>
            <Field.Legend>Reset</Field.Legend>
            <Field.Field orientation="horizontal">
              <Button variant="secondary" onclick={handleReset} disabled={!provider && !apiKey}>
                Reset to env-var defaults
              </Button>
              <Field.Description>
                Clear all override fields and use environment variables exclusively.
              </Field.Description>
            </Field.Field>
          </Field.Set>
        </Field.Group>
      {/if}
    {/snippet}
  </Page.Body>
</Page.Root>
