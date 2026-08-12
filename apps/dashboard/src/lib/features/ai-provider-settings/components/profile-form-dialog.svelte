<script lang="ts">
  import * as Dialog from '@cio/ui/base/dialog';
  import * as Field from '@cio/ui/base/field';
  import * as Select from '@cio/ui/base/select';
  import { Button } from '@cio/ui/base/button';
  import { InputField } from '@cio/ui/custom/input-field';
  import { t } from '$lib/utils/functions/translations';
  import type { CreateAiProfileInput, OrgAiProfile, OrgAiProvider } from '../utils/types';

  interface Props {
    open?: boolean;
    /** Profile being edited; null means "create new". */
    profile?: OrgAiProfile | null;
    /** Provider catalog used for the (customizable) provider dropdown. */
    providers?: OrgAiProvider[];
    saving?: boolean;
    onSave?: (input: CreateAiProfileInput) => void | Promise<void>;
  }

  let { open = $bindable(false), profile = null, providers = [], saving = false, onSave = () => {} }: Props = $props();

  let name = $state('');
  let providerId = $state('');
  let apiKey = $state('');
  let baseURL = $state('');
  let model = $state('');

  // Initialise the draft from the edited profile each time the dialog opens.
  $effect(() => {
    if (!open) return;

    name = profile?.name ?? '';
    providerId = profile?.providerId ?? providers[0]?.id ?? '';
    apiKey = profile?.apiKey ?? '';
    baseURL = profile?.baseURL ?? providers.find((p) => p.id === providerId)?.defaultBaseUrl ?? '';
    model = profile?.model ?? '';
  });

  const canSave = $derived(name.trim().length > 0 && providerId.length > 0);

  /**
   * Fills the base URL from the newly selected provider when the current value
   * is empty or still holds the previous provider's default.
   */
  function handleProviderChange(nextProviderId: string) {
    const previous = providers.find((p) => p.id === providerId);
    const next = providers.find((p) => p.id === nextProviderId);

    providerId = nextProviderId;

    if (!baseURL || (previous && baseURL === previous.defaultBaseUrl)) {
      baseURL = next?.defaultBaseUrl ?? '';
    }
  }

  async function handleSave() {
    await onSave({
      name: name.trim(),
      providerId,
      apiKey: apiKey.trim() || undefined,
      baseURL: baseURL.trim() || undefined,
      model: model.trim() || undefined
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="w-[28rem] pt-3">
    <Dialog.Header class="px-5 py-2">
      <Dialog.Title>
        {profile ? $t('settings.ai_provider.edit_profile_title') : $t('settings.ai_provider.new_profile_title')}
      </Dialog.Title>
    </Dialog.Header>

    <div class="px-5 py-3">
      <Field.Group>
        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.profile_name')}</Field.Label>
          <InputField bind:value={name} placeholder={$t('settings.ai_provider.profile_name_placeholder')} isRequired />
        </Field.Field>

        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.provider')}</Field.Label>
          <Select.Root
            type="single"
            {providerId}
            onValueChange={(value) => value !== undefined && handleProviderChange(value)}
          >
            <Select.Trigger>
              {providers.find((p) => p.id === providerId)?.name ??
                $t('settings.ai_provider.select_provider_placeholder')}
            </Select.Trigger>
            <Select.Content>
              {#each providers as provider (provider.id)}
                <Select.Item value={provider.id} label={provider.name}>
                  {provider.name}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          {#if providers.length === 0}
            <Field.Description>{$t('settings.ai_provider.no_providers_hint')}</Field.Description>
          {/if}
        </Field.Field>

        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.api_key')}</Field.Label>
          <InputField bind:value={apiKey} type="password" placeholder="sk-..." />
          <Field.Description>{$t('settings.ai_provider.api_key_helper')}</Field.Description>
        </Field.Field>

        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.base_url')}</Field.Label>
          <InputField bind:value={baseURL} type="url" placeholder="https://api.openai.com/v1" />
          <Field.Description>{$t('settings.ai_provider.base_url_helper')}</Field.Description>
        </Field.Field>

        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.model')}</Field.Label>
          <InputField bind:value={model} placeholder="gpt-4o-mini" />
          <Field.Description>{$t('settings.ai_provider.model_helper')}</Field.Description>
        </Field.Field>
      </Field.Group>

      <div class="mt-5 flex items-center justify-end gap-2">
        <Button variant="outline" onclick={() => (open = false)}>
          {$t('settings.ai_provider.cancel')}
        </Button>
        <Button loading={saving} disabled={!canSave} onclick={handleSave}>
          {$t('settings.ai_provider.save')}
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
