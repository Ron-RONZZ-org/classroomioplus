<script lang="ts">
  import { embedSenjaWidget } from '@cio/utils/senja';

  interface Props {
    id: string;
  }

  let { id = '' }: Props = $props();

  let isInitialized = $state(false);

  $effect(() => {
    if (isInitialized) return;

    isInitialized = true;
    embedSenjaWidget(id);
  });
</script>

<div class="senja-embed" data-id={id} data-lazyload="false" data-spinner="false"></div>
