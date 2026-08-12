<script lang="ts">
  import * as Dialog from '@cio/ui/base/dialog';
  import { Button } from '@cio/ui/base/button';
  import { t } from '$lib/utils/functions/translations';

  interface Props {
    open?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    loading?: boolean;
    onConfirm?: () => void | Promise<void>;
    onClose?: () => void;
  }

  let {
    open = false,
    title = '',
    message = '',
    confirmLabel = '',
    loading = false,
    onConfirm = () => {},
    onClose = () => {}
  }: Props = $props();

  async function handleConfirm() {
    await onConfirm();
  }
</script>

<Dialog.Root {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content class="w-96 pt-3">
    <Dialog.Header class="px-5 py-2">
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>
    <div class="px-5 py-3">
      <p class="ui:text-muted-foreground text-sm">{message}</p>

      <div class="mt-5 flex items-center justify-end gap-2">
        <Button variant="outline" onclick={onClose}>
          {$t('settings.ai_provider.cancel')}
        </Button>
        <Button variant="destructive" {loading} onclick={handleConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
