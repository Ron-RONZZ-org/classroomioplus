import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProvider, DEFAULT_PROVIDER_PROFILES } from '@cio/ai-assistant';

vi.mock('@cio/db/queries/agent', () => ({
  getOrgAiProviderSettings: vi.fn(),
  updateOrgAiProviderSettings: vi.fn()
}));

import { getOrgAiProviderSettings, updateOrgAiProviderSettings } from '@cio/db/queries/agent';
import {
  getOrgAwareProviderConfig,
  getResolvedOrgAiProvider,
  updateOrgAiProviderService
} from '@api/services/organization/ai-provider';

const mockedGet = vi.mocked(getOrgAiProviderSettings);
const mockedUpdate = vi.mocked(updateOrgAiProviderSettings);

const ENV_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'MOONSHOT_API_KEY', 'DEEPSEEK_API_KEY'];

function storedProfiles() {
  return [
    {
      id: 'google',
      name: 'Google',
      provider: AIProvider.GOOGLE,
      apiKey: 'google-key',
      isDefault: true
    },
    {
      id: 'openai',
      name: 'My OpenAI-compatible proxy',
      provider: AIProvider.OPENAI,
      baseURL: 'https://proxy.example.com/v1',
      apiKey: 'proxy-key',
      model: 'gpt-4o-mini'
    }
  ];
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedUpdate.mockReset();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('getResolvedOrgAiProvider', () => {
  it('returns persisted profiles when stored', async () => {
    mockedGet.mockResolvedValue({ profiles: storedProfiles() });

    const resolved = await getResolvedOrgAiProvider('org-1');

    expect(resolved.isDefault).toBe(false);
    expect(resolved.profiles).toEqual(storedProfiles());
  });

  it('returns the built-in default profiles when nothing is stored', async () => {
    mockedGet.mockResolvedValue(null);

    const resolved = await getResolvedOrgAiProvider('org-1');

    expect(resolved.isDefault).toBe(true);
    expect(resolved.profiles).toEqual(DEFAULT_PROVIDER_PROFILES);
  });
});

describe('getOrgAwareProviderConfig', () => {
  it('prefers the default profile when several profiles share a provider', async () => {
    mockedGet.mockResolvedValue({
      profiles: [
        { id: 'a', name: 'Secondary', provider: AIProvider.OPENAI, apiKey: 'secondary-key' },
        { id: 'b', name: 'Primary', provider: AIProvider.OPENAI, apiKey: 'primary-key', isDefault: true }
      ]
    });

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI);

    expect(config).toEqual({ provider: AIProvider.OPENAI, apiKey: 'primary-key' });
  });

  it('falls back to the provider env var when the profile has no API key', async () => {
    process.env['OPENAI_API_KEY'] = 'env-key';
    mockedGet.mockResolvedValue({ profiles: [{ id: 'a', name: 'OpenAI', provider: AIProvider.OPENAI }] });

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI);

    expect(config?.apiKey).toBe('env-key');
  });

  it('returns null when neither profile nor env var has an API key', async () => {
    mockedGet.mockResolvedValue({ profiles: [{ id: 'a', name: 'OpenAI', provider: AIProvider.OPENAI }] });

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI);

    expect(config).toBeNull();
  });

  it('falls back to env config when no profile matches the provider', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'deepseek-key';
    mockedGet.mockResolvedValue({ profiles: storedProfiles() });

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.DEEPSEEK);

    expect(config).toEqual({ provider: AIProvider.DEEPSEEK, apiKey: 'deepseek-key' });
  });

  it('resolves model precedence: explicit model → profile model', async () => {
    mockedGet.mockResolvedValue({
      profiles: [{ id: 'a', name: 'OpenAI', provider: AIProvider.OPENAI, apiKey: 'key', model: 'profile-model' }]
    });

    expect((await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI))?.model).toBe('profile-model');
    expect((await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI, 'requested-model'))?.model).toBe(
      'requested-model'
    );
  });
});

describe('updateOrgAiProviderService', () => {
  it('replaces profiles and normalizes empty strings away', async () => {
    mockedUpdate.mockResolvedValue({
      profiles: [{ id: 'a', name: 'OpenAI', provider: AIProvider.OPENAI, apiKey: 'key' }]
    });

    const updated = await updateOrgAiProviderService('org-1', {
      profiles: [
        {
          id: 'a',
          name: 'OpenAI',
          provider: AIProvider.OPENAI,
          apiKey: 'key',
          baseURL: '',
          model: '   '
        }
      ]
    });

    expect(mockedUpdate).toHaveBeenCalledWith('org-1', [
      { id: 'a', name: 'OpenAI', provider: AIProvider.OPENAI, apiKey: 'key' }
    ]);
    expect(updated.isDefault).toBe(false);
  });

  it('resets to the built-in defaults when reset is requested', async () => {
    mockedUpdate.mockResolvedValue(null);

    const updated = await updateOrgAiProviderService('org-1', { reset: true });

    expect(mockedUpdate).toHaveBeenCalledWith('org-1', null);
    expect(updated).toEqual({ profiles: DEFAULT_PROVIDER_PROFILES, isDefault: true });
  });

  it('throws when the organization does not exist', async () => {
    mockedUpdate.mockResolvedValue(null);

    await expect(
      updateOrgAiProviderService('missing-org', {
        profiles: [{ id: 'a', name: 'OpenAI', provider: AIProvider.OPENAI, apiKey: 'key' }]
      })
    ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
  });
});
