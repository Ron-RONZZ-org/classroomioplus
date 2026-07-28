<script lang="ts">
  import * as InputGroup from '../../base/input-group';
  import * as Tooltip from '../../base/tooltip';
  import LockIcon from '@lucide/svelte/icons/lock';
  import EyeIcon from '@lucide/svelte/icons/eye';
  import EyeOffIcon from '@lucide/svelte/icons/eye-off';
  import type { ComponentProps } from 'svelte';
  import { cn } from '../../tools';

  type PasswordInputAutocomplete = ComponentProps<typeof InputGroup.Input>['autocomplete'];

  interface Props {
    placeholder?: string;
    value?: string;
    class?: string;
    disabled?: boolean;
    'aria-invalid'?: 'true' | 'false' | undefined;
    autocomplete?: PasswordInputAutocomplete;
    showPasswordTooltip?: string;
    hidePasswordTooltip?: string;
    showPasswordAriaLabel?: string;
    hidePasswordAriaLabel?: string;
  }

  let {
    placeholder = '************',
    value = $bindable(''),
    class: className = '',
    disabled = false,
    'aria-invalid': ariaInvalid,
    autocomplete,
    showPasswordTooltip = 'Show password',
    hidePasswordTooltip = 'Hide password',
    showPasswordAriaLabel = 'Show password',
    hidePasswordAriaLabel = 'Hide password',
    ...restProps
  }: Props & Omit<ComponentProps<typeof InputGroup.Root>, 'class' | 'children'> = $props();

  let showPassword = $state(false);

  const tooltipText = $derived(showPassword ? hidePasswordTooltip : showPasswordTooltip);
  const ariaLabel = $derived(showPassword ? hidePasswordAriaLabel : showPasswordAriaLabel);
</script>

<InputGroup.Root class={cn('ui:w-full', className)} data-slot="password">
  <InputGroup.Addon align="inline-start">
    <LockIcon />
  </InputGroup.Addon>
  <InputGroup.Input
    type={showPassword ? 'text' : 'password'}
    {placeholder}
    bind:value
    {disabled}
    aria-invalid={ariaInvalid}
    {autocomplete}
    {...restProps}
  />
  <InputGroup.Addon align="inline-end">
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              data-slot="input-group-button"
              type="button"
              onclick={() => (showPassword = !showPassword)}
              aria-label={ariaLabel}
              {disabled}
              class={cn(
                'ui:inline-flex ui:items-center ui:justify-center ui:shrink-0 ui:rounded-[calc(var(--radius)-5px)] ui:text-sm ui:font-medium ui:outline-hidden ui:transition-all ui:select-none ui:cursor-pointer ui:bg-transparent ui:hover:bg-accent ui:hover:text-accent-foreground ui:size-6 ui:p-0 ui:has-[>svg]:p-0',
                'ui:disabled:pointer-events-none ui:disabled:cursor-not-allowed ui:disabled:opacity-50',
                'ui:focus-visible:border-ring ui:focus-visible:ring-ring/50 ui:focus-visible:ring-[3px]',
                'ui:[&_svg]:shrink-0 ui:[&_svg]:size-3.5'
              )}
            >
              {#if showPassword}
                <EyeOffIcon />
              {:else}
                <EyeIcon />
              {/if}
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{tooltipText}</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </InputGroup.Addon>
</InputGroup.Root>
