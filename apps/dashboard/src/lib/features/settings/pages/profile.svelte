<script lang="ts">
  import { page } from '$app/state';
  import type { TLocale } from '@cio/db/types';
  import { profile } from '$lib/utils/store/user';
  import { CircleCheckBig } from '@lucide/svelte';
  import { profileApi } from '$features/auth/api/profile.svelte';
  import { t } from '$lib/utils/functions/translations';
  import LanguagePicker from '../components/language-picker.svelte';
  import { Input } from '@cio/ui/base/input';
  import { Password } from '@cio/ui/custom/password';
  import { Button } from '@cio/ui/base/button';
  import { UploadImage, UnsavedChanges } from '$features/ui';
  import * as Field from '@cio/ui/base/field';

  let avatar = $state<string | File | undefined>();
  let hasLangChanged = $state(false);
  let locale = $derived<TLocale | undefined>($profile.locale || undefined);
  let hasUnsavedChanges = $state(false);
  let email = $derived($profile.email || '');
  let isChangingEmail = $state(false);
  let emailChangeInitiated = $state(false);

  // Change password state
  let passwordForm = $state({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  let isChangingPassword = $state(false);
  let passwordChanged = $state(false);

  function resetPasswordForm() {
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
    passwordChanged = false;
  }

  async function handlePasswordChange() {
    await profileApi.changePassword(passwordForm);

    if (profileApi.success) {
      isChangingPassword = false;
      resetPasswordForm();
    }
  }

  export async function handleUpdate() {
    await profileApi.submit(
      {
        fullname: $profile.fullname,
        username: $profile.username,
        locale,
        avatar
      },
      hasLangChanged,
      locale
    );

    if (profileApi.success) {
      hasUnsavedChanges = false;
      avatar = undefined;
    }
  }

  async function handleEmailChange() {
    if (email === $profile.email) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('trigger', 'app');

    await profileApi.changeEmail({
      newEmail: email,
      callbackURL: url.toString()
    });

    if (profileApi.success) {
      isChangingEmail = false;
      emailChangeInitiated = true;
      // Reset email field to current email after successful change request
      email = $profile.email || '';
    }
  }

  const isVerificationSent = $derived(page.url.searchParams.get('trigger') === 'app');
</script>

<UnsavedChanges bind:hasUnsavedChanges />

<Field.Group class="w-full max-w-md! px-2">
  <Field.Set>
    <Field.Legend>{$t('settings.profile.profile_picture.heading')}</Field.Legend>
    <Field.Field>
      <UploadImage
        bind:avatar
        src={$profile.avatarUrl}
        widthHeight="w-16 h-16 lg:w-24 lg:h-24"
        isDisabled={profileApi.isLoading}
        change={() => (hasUnsavedChanges = true)}
      />
    </Field.Field>
  </Field.Set>

  <Field.Separator />

  <Field.Set>
    <Field.Legend>{$t('settings.profile.personal_information.heading')}</Field.Legend>

    {#if isVerificationSent}
      <div class="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-green-500">
        <CircleCheckBig class="size-8" />
        <p class="text-sm">{$t('settings.profile.personal_information.email_change_verification_sent')}</p>
      </div>
    {/if}

    <Field.Group>
      <Field.Field>
        <Field.Label>{$t('settings.profile.personal_information.full_name')}</Field.Label>
        <Input bind:value={$profile.fullname} class="" oninput={() => (hasUnsavedChanges = true)} />
        {#if profileApi.errors.fullname}
          <Field.Error>{$t(profileApi.errors.fullname)}</Field.Error>
        {/if}
      </Field.Field>
      <Field.Field>
        <Field.Label>{$t('settings.profile.personal_information.username')}</Field.Label>
        <Input bind:value={$profile.username} oninput={() => (hasUnsavedChanges = true)} />
        {#if profileApi.errors.username}
          <Field.Error>{$t(profileApi.errors.username)}</Field.Error>
        {/if}
      </Field.Field>
      <Field.Field>
        <Field.Label>{$t('settings.profile.personal_information.email')}</Field.Label>
        <Input
          bind:value={email}
          class="w-full"
          type="email"
          disabled={profileApi.isLoading}
          oninput={() => {
            if (email !== $profile.email) {
              isChangingEmail = true;
              emailChangeInitiated = false;
            }
          }}
        />
        {#if profileApi.errors.newEmail}
          <Field.Error>{$t(profileApi.errors.newEmail)}</Field.Error>
        {/if}
        {#if isChangingEmail && email !== $profile.email}
          <div class="mt-2 flex gap-2">
            <Button
              variant="default"
              class="text-sm"
              loading={profileApi.isLoading}
              disabled={profileApi.isLoading}
              onclick={handleEmailChange}
            >
              {$t('settings.profile.personal_information.confirm')}
            </Button>
            <Button
              variant="ghost"
              class="ui:text-primary text-sm"
              disabled={profileApi.isLoading}
              onclick={() => {
                email = $profile.email || '';
                isChangingEmail = false;
                emailChangeInitiated = false;
                profileApi.errors.newEmail = '';
              }}
            >
              {$t('settings.profile.personal_information.cancel')}
            </Button>
          </div>
        {/if}
        {#if emailChangeInitiated}
          <div class="mt-2 flex items-center gap-2 rounded-md border border-gray-200 p-2 text-amber-500">
            <CircleCheckBig class="size-8" />
            <p class="text-sm">{$t('settings.profile.personal_information.email_change_verification_note')}</p>
          </div>
        {/if}
      </Field.Field>
      <Field.Field>
        <LanguagePicker
          change={() => (hasUnsavedChanges = true)}
          bind:hasLangChanged
          bind:value={locale}
          className=""
        />
      </Field.Field>
    </Field.Group>
  </Field.Set>

  <Field.Separator />

  <Field.Set>
    <Field.Legend>{$t('settings.profile.password.change_password.heading')}</Field.Legend>
    <Field.Description>{$t('settings.profile.password.change_password.page_subtitle')}</Field.Description>

    {#if passwordChanged}
      <div class="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-green-500">
        <CircleCheckBig class="size-8" />
        <p class="text-sm">{$t('settings.profile.password.change_password.success')}</p>
      </div>
    {:else if isChangingPassword}
      <Field.Group>
        <Field.Field>
          <Field.Label>{$t('settings.profile.password.change_password.current_password')}</Field.Label>
          <Password
            bind:value={passwordForm.currentPassword}
            autocomplete="current-password"
            aria-invalid={profileApi.errors.currentPassword ? 'true' : undefined}
          />
          {#if profileApi.errors.currentPassword}
            <Field.Error>{$t(profileApi.errors.currentPassword)}</Field.Error>
          {/if}
        </Field.Field>
        <Field.Field>
          <Field.Label>{$t('settings.profile.password.change_password.new_password')}</Field.Label>
          <Password
            bind:value={passwordForm.newPassword}
            autocomplete="new-password"
            aria-invalid={profileApi.errors.newPassword ? 'true' : undefined}
          />
          {#if profileApi.errors.newPassword}
            <Field.Error>{$t(profileApi.errors.newPassword)}</Field.Error>
          {/if}
        </Field.Field>
        <Field.Field>
          <Field.Label>{$t('settings.profile.password.change_password.confirm_password')}</Field.Label>
          <Password
            bind:value={passwordForm.confirmPassword}
            autocomplete="new-password"
            aria-invalid={profileApi.errors.confirmPassword ? 'true' : undefined}
          />
          {#if profileApi.errors.confirmPassword}
            <Field.Error>{$t(profileApi.errors.confirmPassword)}</Field.Error>
          {/if}
        </Field.Field>
        <div class="flex gap-2">
          <Button
            variant="default"
            loading={profileApi.isLoading}
            disabled={profileApi.isLoading}
            onclick={handlePasswordChange}
          >
            {$t('settings.profile.password.change_password.update')}
          </Button>
          <Button
            variant="ghost"
            class="ui:text-primary"
            disabled={profileApi.isLoading}
            onclick={() => {
              isChangingPassword = false;
              resetPasswordForm();
              profileApi.errors.currentPassword = '';
              profileApi.errors.newPassword = '';
              profileApi.errors.confirmPassword = '';
            }}
          >
            {$t('settings.profile.password.change_password.cancel')}
          </Button>
        </div>
      </Field.Group>
    {:else}
      <Button variant="outline" onclick={() => (isChangingPassword = true)}>
        {$t('settings.profile.password.change_password.change')}
      </Button>
    {/if}
  </Field.Set>
</Field.Group>
