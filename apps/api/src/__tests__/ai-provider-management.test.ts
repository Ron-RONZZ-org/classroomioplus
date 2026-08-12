import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRole, AIProvider } from '@cio/ai-assistant';

import {
  activateAiProfileService,
  createAiProfileService,
  deleteAiProviderService,
  getOrgAwareProviderConfig
} from '@api/services/organization/ai-provider';
import type { OrgAiProfile, OrgAiProvider, OrgAiProviderManagement } from '@cio/ai-assistant';

vi.mock('@cio/db/queries/agent', () => ({
  activateOrgAiProfile: vi.fn(),
  createOrgAiProfile: vi.fn(),
  createOrgAiProvider: vi.fn(),
  deleteOrgAiProfile: vi.fn(),
  deleteOrgAiProvider: vi.fn(),
  ensureDefaultAiProviderData: vi.fn(),
  getOrgAiProviderManagement: vi.fn(),
  updateOrgAiProfile: vi.fn(),
  updateOrgAiProvider: vi.fn()
}));

import {
  activateOrgAiProfile,
  createOrgAiProfile,
  deleteOrgAiProvider,
  getOrgAiProviderManagement
} from '@cio/db/queries/agent';
import { AppError } from '@api/utils/errors';

const mockedGetManagement = vi.mocked(getOrgAiProviderManagement);
const mockedCreateProfile = vi.mocked(createOrgAiProfile);
const mockedDeleteProvider = vi.mocked(deleteOrgAiProvider);
const mockedActivateProfile = vi.mocked(activateOrgAiProfile);

const openaiProvider: OrgAiProvider = {
  id: 'prov-openai',
  name: 'OpenAI',
  providerType: 'openai',
  defaultBaseUrl: 'https://api.openai.com/v1'
};
const deepseekProvider: OrgAiProvider = {
  id: 'prov-deepseek',
  name: 'DeepSeek',
  providerType: 'deepseek',
  defaultBaseUrl: 'https://api.deepseek.com/v1'
};

const teacherProfile: OrgAiProfile = {
  id: 'prof-teacher',
  name: 'OpenAI (teacher)',
  providerId: openaiProvider.id,
  apiKey: 'sk-teacher',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini'
};
const studentProfile: OrgAiProfile = {
  id: 'prof-student',
  name: 'DeepSeek (student)',
  providerId: deepseekProvider.id,
  apiKey: 'sk-student',
  model: 'deepseek-chat'
};

function management(overrides?: Partial<OrgAiProviderManagement>): OrgAiProviderManagement {
  return {
    providers: [openaiProvider, deepseekProvider],
    profiles: [teacherProfile, studentProfile],
    activeProfileByRole: { teacher: teacherProfile.id, student: studentProfile.id },
    ...overrides
  };
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
});

describe('getOrgAwareProviderConfig', () => {
  it('uses the active profile for the requested role when provider matches', async () => {
    mockedGetManagement.mockResolvedValue(management());

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI, 'gpt-4o-mini', AgentRole.TEACHER);

    expect(config).toEqual({
      provider: AIProvider.OPENAI,
      apiKey: 'sk-teacher',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    });
  });

  it('resolves teacher and student roles to their own active profiles', async () => {
    mockedGetManagement.mockResolvedValue(management());

    const teacher = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI, undefined, AgentRole.TEACHER);
    const student = await getOrgAwareProviderConfig('org-1', AIProvider.DEEPSEEK, undefined, AgentRole.STUDENT);

    expect(teacher?.apiKey).toBe('sk-teacher');
    expect(student?.apiKey).toBe('sk-student');
    // Student profile has no baseURL → provider default is used.
    expect(student?.baseURL).toBe('https://api.deepseek.com/v1');
    // Profile model is used when no explicit model is passed.
    expect(student?.model).toBe('deepseek-chat');
  });

  it('falls back to env vars when the active profile provider does not match', async () => {
    mockedGetManagement.mockResolvedValue(management());
    process.env.OPENAI_API_KEY = 'sk-env';

    // Active teacher profile is OpenAI, but a Google model is requested.
    const config = await getOrgAwareProviderConfig('org-1', AIProvider.GOOGLE, undefined, AgentRole.TEACHER);

    expect(config?.apiKey).toBe(undefined); // no env key for google
    expect(config).toBeNull();
  });

  it('falls back to env vars when the active profile has no API key', async () => {
    const noKeyProfile: OrgAiProfile = { ...teacherProfile, apiKey: undefined };
    mockedGetManagement.mockResolvedValue(
      management({ profiles: [noKeyProfile, studentProfile], activeProfileByRole: { teacher: noKeyProfile.id } })
    );
    process.env.OPENAI_API_KEY = 'sk-env';

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI, undefined, AgentRole.TEACHER);

    expect(config?.apiKey).toBe('sk-env');
  });

  it('falls back to env vars when no profile is active for the role', async () => {
    mockedGetManagement.mockResolvedValue(management({ activeProfileByRole: {} }));
    process.env.DEEPSEEK_API_KEY = 'sk-env';

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.DEEPSEEK, undefined, AgentRole.TEACHER);

    expect(config?.apiKey).toBe('sk-env');
  });

  it('returns null when nothing is configured', async () => {
    mockedGetManagement.mockResolvedValue(management({ activeProfileByRole: {} }));

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI, undefined, AgentRole.TEACHER);

    expect(config).toBeNull();
  });

  it('defaults to the teacher role when no role is passed', async () => {
    mockedGetManagement.mockResolvedValue(management());

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI);

    expect(config?.apiKey).toBe('sk-teacher');
  });

  it('uses profile baseURL over provider default when both present', async () => {
    const customUrlProfile: OrgAiProfile = { ...teacherProfile, baseURL: 'https://proxy.example.com/v1' };
    mockedGetManagement.mockResolvedValue(
      management({
        profiles: [customUrlProfile, studentProfile],
        activeProfileByRole: { teacher: customUrlProfile.id }
      })
    );

    const config = await getOrgAwareProviderConfig('org-1', AIProvider.OPENAI, undefined, AgentRole.TEACHER);

    expect(config?.baseURL).toBe('https://proxy.example.com/v1');
  });
});

describe('createAiProfileService', () => {
  it('defaults baseURL from the provider catalog when omitted', async () => {
    mockedGetManagement.mockResolvedValue(management());
    mockedCreateProfile.mockResolvedValue({ ...teacherProfile, baseURL: 'https://api.openai.com/v1' });

    const profile = await createAiProfileService('org-1', {
      name: 'OpenAI (teacher)',
      providerId: openaiProvider.id,
      apiKey: 'sk-teacher'
    });

    expect(mockedCreateProfile).toHaveBeenCalledWith('org-1', {
      name: 'OpenAI (teacher)',
      providerId: openaiProvider.id,
      apiKey: 'sk-teacher',
      baseURL: 'https://api.openai.com/v1'
    });
    expect(profile.baseURL).toBe('https://api.openai.com/v1');
  });

  it('throws NOT_FOUND when the referenced provider does not exist', async () => {
    mockedGetManagement.mockResolvedValue(management());

    await expect(createAiProfileService('org-1', { name: 'Ghost', providerId: 'prov-missing' })).rejects.toThrowError(
      AppError
    );
  });
});

describe('deleteAiProviderService', () => {
  it('throws CONFLICT when profiles still reference the provider', async () => {
    mockedDeleteProvider.mockResolvedValue({ deleted: false, referencedByProfiles: 2 });

    await expect(deleteAiProviderService('org-1', openaiProvider.id)).rejects.toThrow(
      expect.objectContaining({ code: 'CONFLICT', statusCode: 409 })
    );
  });

  it('returns deleted when the provider is unreferenced', async () => {
    mockedDeleteProvider.mockResolvedValue({ deleted: true, referencedByProfiles: 0 });

    await expect(deleteAiProviderService('org-1', openaiProvider.id)).resolves.toEqual({ deleted: true });
  });

  it('throws NOT_FOUND when the provider does not exist', async () => {
    mockedDeleteProvider.mockResolvedValue(null);

    await expect(deleteAiProviderService('org-1', 'prov-missing')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 })
    );
  });
});

describe('activateAiProfileService', () => {
  it('activates the profile for the given role', async () => {
    mockedGetManagement.mockResolvedValue(management());
    mockedActivateProfile.mockResolvedValue({ teacher: teacherProfile.id });

    await expect(activateAiProfileService('org-1', 'teacher', teacherProfile.id)).resolves.toEqual({
      teacher: teacherProfile.id
    });
    expect(mockedActivateProfile).toHaveBeenCalledWith('org-1', 'teacher', teacherProfile.id);
  });

  it('throws NOT_FOUND when the profile does not exist', async () => {
    mockedGetManagement.mockResolvedValue(management());

    await expect(activateAiProfileService('org-1', 'teacher', 'prof-missing')).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 })
    );
  });
});
