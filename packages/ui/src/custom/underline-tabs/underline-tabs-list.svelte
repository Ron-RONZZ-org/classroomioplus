<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui';
  import { cn } from '../../tools';

  let { ref = $bindable(null), class: className, children, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
  bind:ref
  data-slot="underline-tabs-list"
  class={cn(
    'ui:text-muted-foreground ui:border-border ui:relative ui:inline-flex ui:h-9 ui:w-full ui:max-w-full ui:items-center ui:justify-start ui:overflow-x-auto ui:border-b',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</TabsPrimitive.List>
