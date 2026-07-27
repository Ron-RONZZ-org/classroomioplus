<script lang="ts">
  import type { HTMLContent, Content, Editor } from '@tiptap/core';
  import type { Transaction } from '@tiptap/pm/state';
  import { EdraEditor, EdraToolBar, EdraBubbleMenu, EdraDragHandleExtended } from './ui';
  import { slide } from 'svelte/transition';
  import { cn } from '$src/tools';
  import Code from '@lucide/svelte/icons/code';

  interface Props {
    // Content of the editor
    content?: HTMLContent;
    // Whether the toolbar should be visible
    showToolBar?: boolean;
    // Whether the editor is editable
    editable?: boolean;
    // Whether to enable localStorage persistence
    enablePersistence?: boolean;
    // localStorage key for content persistence
    contentStorageKey?: string;
    // localStorage key for editable state persistence
    editableStorageKey?: string;
    // Whether to show a Source/Visual toggle in the toolbar
    showSourceToggle?: boolean;
    // CSS class for the editor wrapper
    class?: string;
    // CSS class for the editor itself
    editorClass?: string;
    // Placeholder text for the editor
    placeholder?: string | ((node: any) => string);
    // Callback functions
    onContentChange?: (content: HTMLContent) => void;
    onEditorReady?: (editor: Editor) => void;
    onEditorDestroy?: () => void;
  }

  let {
    content = $bindable(''),
    showToolBar = true,
    editable = true,
    enablePersistence = false,
    contentStorageKey = 'edra-content',
    editableStorageKey = 'edra-editable',
    showSourceToggle = false,
    class: className = '',
    editorClass = '',
    placeholder,
    onContentChange,
    onEditorReady
  }: Props = $props();

  let editor = $state<Editor>();

  // Browser detection
  const browser = typeof window !== 'undefined';

  function normalizeEditorContent(value: HTMLContent | undefined): string {
    const html = String(value ?? '').trim();

    if (html === '' || html === '<p></p>' || html === '<p><br></p>') return '';

    return html;
  }

  // Handle content persistence
  $effect(() => {
    if (enablePersistence && browser && content) {
      localStorage.setItem(contentStorageKey, JSON.stringify(content));
    }
  });

  // Handle editable state persistence
  $effect(() => {
    if (enablePersistence && browser) {
      localStorage.setItem(editableStorageKey, editable.toString());
    }
  });

  // Load persisted content and editable state on mount
  $effect(() => {
    if (enablePersistence && browser) {
      try {
        // Load content
        const rawContentString = localStorage.getItem(contentStorageKey);
        if (rawContentString !== null) {
          console.log('persistedContent', rawContentString);
          content = rawContentString;
        }

        // Load editable state
        const rawEditableString = localStorage.getItem(editableStorageKey);
        if (rawEditableString !== null) {
          editable = rawEditableString === 'true';
        }
      } catch (error) {
        console.warn('Failed to load persisted state:', error);
      }
    }
  });

  let isEditorReady = $state(false);
  // Handle editor ready
  $effect(() => {
    if (editor && !isEditorReady) {
      isEditorReady = true;
      onEditorReady?.(editor);
    }
  });

  $effect(() => {
    if (!editor || editor.isDestroyed) return;

    const nextContent = normalizeEditorContent(content);
    const currentContent = normalizeEditorContent(editor.getHTML());

    if (currentContent === nextContent) return;

    editor.commands.setContent(nextContent, false);
  });

  function onUpdate(props: { editor: Editor; transaction: Transaction }) {
    if (props?.editor && !props.editor.isDestroyed) {
      const newContent = props.editor.getHTML();
      content = newContent;
      onContentChange?.(newContent);
    }
  }

  let sourceMode = $state(false);
  let sourceTextareaEl: HTMLTextAreaElement | undefined = $state();

  function toggleSourceMode() {
    if (!editor || editor.isDestroyed) return;

    if (sourceMode) {
      // Switching back to Visual mode — push textarea content into Tiptap
      const raw = sourceTextareaEl?.value ?? '';
      editor.commands.setContent(raw, false);
      sourceMode = false;
    } else {
      // Switching to Source mode — capture current HTML into textarea
      sourceMode = true;
      // Use $effect-friendly pattern: the textarea will read editor.getHTML()
      // when it mounts via its bind:value
    }
  }
</script>

{#if browser}
  <div
    class={cn(
      'ui:relative ui:bg-background ui:z-50 ui:flex ui:size-full ui:w-full ui:flex-col ui:rounded-md ui:border ui:border-dashed',
      className
    )}
  >
    {#if editor && !editor.isDestroyed}
      {#if showToolBar}
        <div class="ui:flex ui:w-full ui:items-stretch">
          <div transition:slide class="ui:flex-1 ui:min-w-0">
            <EdraToolBar
              class="ui:bg-secondary/50 ui:flex ui:w-full ui:items-center ui:overflow-x-auto ui:border-b ui:border-dashed ui:p-0.5"
              {editor}
            />
          </div>
          {#if showSourceToggle && editable}
            <button
              type="button"
              onclick={toggleSourceMode}
              title={sourceMode ? 'Visual mode' : 'Source mode'}
              aria-label={sourceMode ? 'Switch to visual mode' : 'Switch to source mode'}
              class={cn(
                'ui:flex ui:shrink-0 ui:items-center ui:justify-center ui:gap-1.5 ui:px-3 ui:text-xs ui:font-medium ui:border-b ui:border-dashed ui:transition-colors',
                sourceMode ? 'ui:bg-primary/10 ui:text-primary' : 'ui:text-muted-foreground ui:hover:bg-secondary/50'
              )}
            >
              <Code size={14} />
              {sourceMode ? 'Visual' : 'Source'}
            </button>
          {/if}
        </div>
      {/if}

      {#if !sourceMode}
        <EdraBubbleMenu {editor} />

        {#if editable}
          <EdraDragHandleExtended {editor} />
        {/if}
      {/if}
    {/if}

    {#if sourceMode}
      <textarea
        bind:this={sourceTextareaEl}
        value={sourceMode && editor && !editor.isDestroyed ? editor.getHTML() : ''}
        class={cn(
          'ui:relative ui:h-128 ui:w-full ui:resize-none ui:overflow-auto ui:p-4 ui:font-mono ui:text-sm ui:leading-relaxed',
          'ui:bg-background ui:text-foreground ui:outline-none',
          editorClass
        )}
      ></textarea>
    {:else}
      <EdraEditor
        class={cn('ui:relative ui:h-128 ui:overflow-auto ui:p-4', editorClass)}
        bind:editor
        {editable}
        {content}
        {onUpdate}
        {placeholder}
      />
    {/if}
  </div>
{/if}
