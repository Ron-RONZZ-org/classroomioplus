<script lang="ts">
  interface Props {
    /** Callback invoked when the user presses Ctrl/Cmd+S. */
    onSave: () => void | Promise<void>;
  }

  let { onSave }: Props = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
      return;
    }

    // Always suppress the browser's native "Save page" dialog.
    event.preventDefault();
    void onSave();
  }
</script>

<svelte:window onkeydown={handleKeydown} />
