<script lang="ts">
  import * as Dialog from '@cio/ui/base/dialog';
  import * as Field from '@cio/ui/base/field';
  import * as Select from '@cio/ui/base/select';
  import { Button } from '@cio/ui/base/button';
  import { InputField } from '@cio/ui/custom/input-field';
  import { t } from '$lib/utils/functions/translations';
  import type { CreateAiProviderInput, OrgAiProvider } from '../utils/types';

  interface Props {
    open?: boolean;
    /** Provider being edited; null means "create new". */
    provider?: OrgAiProvider | null;
    saving?: boolean;
    onSave?: (input: CreateAiProviderInput) => void | Promise<void>;
  }

  let { open = $bindable(false), provider = null, saving = false, onSave = () => {} }: Props = $props();

  const PROVIDER_TYPES = ['openai', 'anthropic', 'google', 'moonshot', 'deepseek'] as const;

  let name = $state('');
  let providerType = $state<OrgAiProvider['providerType']>('openai');
  let defaultBaseUrl = $state('');

  // Initialise the draft from the edited provider each time the dialog opens.
  $effect(() => {
    if (!open) return;

    name = provider?.name ?? '';
    providerType = provider?.providerType ?? 'openai';
    defaultBaseUrl = provider?.defaultBaseUrl ?? '';
  });

  const canSave = $derived(name.trim().length > 0);

  async function handleSave() {
    await onSave({
      name: name.trim(),
      providerType,
      defaultBaseUrl: defaultBaseUrl.trim() || undefined
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="w-[28rem] pt-3">
    <Dialog.Header class="px-5 py-2">
      <Dialog.Title>
        {provider ? $t('settings.ai_provider.edit_provider_title') : $t('settings.ai_provider.new_provider_title')}
      </Dialog.Title>
    </Dialog.Header>

    <div class="px-5 py-3">
      <Field.Group>
        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.provider_name')}</Field.Label>
          <InputField bind:value={name} placeholder={$t('settings.ai_provider.provider_name_placeholder')} isRequired />
        </Field.Field>

        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.provider_type')}</Field.Label>
          <Select.Root
            type="single"
            value={providerType}
            onValueChange={(value) => value !== undefined && (providerType = value as OrgAiProvider['providerType'])}
          >
            <Select.Trigger>
              {PROVIDER_TYPES.find((type) => type === providerType) ?? providerType}
            </Select.Trigger>
            <Select.Content>
              {#each PROVIDER_TYPES as type (type)}
                <Select.Item value={type} label={type}>
                  {type}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </Field.Field>

        <Field.Field>
          <Field.Label>{$t('settings.ai_provider.default_base_url')}</Field.Label>
          <InputField
            bind:value={defaultBaseUrl}
            type="url"
            placeholder="https://api.openai.com/v1"
            helperMessage={$t('settings.ai_provider.default_base_url_helper')}
          />
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
