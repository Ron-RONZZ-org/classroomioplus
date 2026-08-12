/**
 * AI provider & profile management integration tests.
 *
 * Exercises the /organization/ai-provider routes against the seeded test DB:
 * lazy seeding of default providers/profiles, CRUD, per-role activation,
 * provider-delete conflict, and permission gates.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '@api/app';

const TEST_ORG_ID = '1a1dcddd-1abc-4f72-b644-0bd18191a289';

let createdProviderId: string | null = null;
let createdProfileId: string | null = null;
let referencedProfileId: string | null = null;

async function login(email: string, password: string): Promise<string> {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Login failed — no cookie');

  return setCookie
    .split(/, (?=[a-zA-Z0-9_-]+\.session_)/)
    .map((part: string) => part.split(';')[0].trim())
    .join('; ');
}

async function loginAsAdmin(): Promise<string> {
  return login('admin@test.com', '123456');
}

async function loginAsStudent(): Promise<string> {
  return login('student@test.com', '123456');
}

function collectionOf(body: { data: { providers: unknown[]; profiles: unknown[] } }) {
  return body.data;
}

/** Best-effort cleanup of entities created during the tests. */
async function cleanup(adminCookie: string) {
  if (createdProfileId) {
    await app.request(`/organization/ai-provider/profiles/${createdProfileId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    createdProfileId = null;
  }
  if (referencedProfileId) {
    await app.request(`/organization/ai-provider/profiles/${referencedProfileId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    referencedProfileId = null;
  }
  if (createdProviderId) {
    await app.request(`/organization/ai-provider/providers/${createdProviderId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    createdProviderId = null;
  }
}

describe('organization AI provider management', () => {
  let adminCookie: string;

  afterAll(async () => {
    if (adminCookie) await cleanup(adminCookie);
  });

  it('requires authentication', async () => {
    const res = await app.request('/organization/ai-provider');
    expect(res.status).toBe(401);
  });

  it('seeds default providers and profiles on first read', async () => {
    adminCookie = await loginAsAdmin();
    const res = await app.request('/organization/ai-provider', {
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const { providers, profiles } = collectionOf(body);
    expect(providers.length).toBeGreaterThanOrEqual(5);
    expect(profiles.length).toBeGreaterThanOrEqual(5);

    // Every default provider got a profile referencing it.
    const profileProviderIds = new Set((profiles as { providerId: string }[]).map((p) => p.providerId));
    for (const provider of providers as { id: string }[]) {
      expect(profileProviderIds.has(provider.id)).toBe(true);
    }
  });

  it('blocks non-admin members from mutations', async () => {
    const studentCookie = await loginAsStudent();
    const res = await app.request('/organization/ai-provider/providers', {
      method: 'POST',
      headers: { cookie: studentCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked', providerType: 'openai' })
    });
    expect(res.status).toBe(403);
  });

  it('creates, updates and deletes a provider', async () => {
    const create = await app.request('/organization/ai-provider/providers', {
      method: 'POST',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Custom LLM',
        providerType: 'openai',
        defaultBaseUrl: 'https://custom.example.com/v1'
      })
    });
    expect(create.status).toBe(200);
    const createBody = await create.json();
    const created = (createBody.data.providers as { id: string; name: string }[]).find((p) => p.name === 'Custom LLM');
    expect(created).toBeDefined();
    createdProviderId = created!.id;

    const update = await app.request(`/organization/ai-provider/providers/${createdProviderId}`, {
      method: 'PUT',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultBaseUrl: 'https://updated.example.com/v1' })
    });
    expect(update.status).toBe(200);
    const updateBody = await update.json();
    const updated = (updateBody.data.providers as { id: string; defaultBaseUrl?: string }[]).find(
      (p) => p.id === createdProviderId
    );
    expect(updated?.defaultBaseUrl).toBe('https://updated.example.com/v1');

    const del = await app.request(`/organization/ai-provider/providers/${createdProviderId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    expect(del.status).toBe(200);
    const delBody = await del.json();
    expect((delBody.data.providers as { id: string }[]).some((p) => p.id === createdProviderId)).toBe(false);
    createdProviderId = null;
  });

  it('defaults profile base URL from the provider catalog', async () => {
    // Create a provider to reference.
    const providerRes = await app.request('/organization/ai-provider/providers', {
      method: 'POST',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Custom LLM',
        providerType: 'openai',
        defaultBaseUrl: 'https://custom.example.com/v1'
      })
    });
    expect(providerRes.status).toBe(200);
    const providerBody = await providerRes.json();
    const createdProvider = (providerBody.data.providers as { id: string; name: string }[]).find(
      (p) => p.name === 'Custom LLM'
    )!;
    createdProviderId = createdProvider.id;

    // Create a profile without a baseURL — the service should default it from the provider.
    const create = await app.request('/organization/ai-provider/profiles', {
      method: 'POST',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Custom LLM profile', providerId: createdProviderId })
    });
    expect(create.status).toBe(200);
    const body = await create.json();
    const profile = (body.data.profiles as { name: string; baseURL?: string; id: string }[]).find(
      (p) => p.name === 'Custom LLM profile'
    );
    expect(profile).toBeDefined();
    expect(profile?.baseURL).toBe('https://custom.example.com/v1');
    createdProfileId = profile?.id ?? null;
  });

  it('rejects creating a profile for a nonexistent provider', async () => {
    const res = await app.request('/organization/ai-provider/profiles', {
      method: 'POST',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost profile', providerId: '00000000-0000-0000-0000-000000000000' })
    });
    expect(res.status).toBe(404);
  });

  it('activates a profile per role and blocks provider deletion while referenced', async () => {
    // Pick an existing default profile.
    const get = await app.request('/organization/ai-provider', {
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    const getBody = await get.json();
    const firstProfile = getBody.data.profiles[0] as { id: string; providerId: string };
    referencedProfileId = firstProfile.id;

    const activate = await app.request(`/organization/ai-provider/profiles/${firstProfile.id}/activate`, {
      method: 'PUT',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'teacher' })
    });
    expect(activate.status).toBe(200);
    const activateBody = await activate.json();
    expect(activateBody.data.activeProfileByRole.teacher).toBe(firstProfile.id);

    // Deleting the provider it references must 409.
    const del = await app.request(`/organization/ai-provider/providers/${firstProfile.providerId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID }
    });
    expect(del.status).toBe(409);
  });

  it('validates profile payloads', async () => {
    const res = await app.request('/organization/ai-provider/profiles', {
      method: 'POST',
      headers: { cookie: adminCookie, 'cio-org-id': TEST_ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', providerId: 'x' })
    });
    expect(res.status).toBe(400);
  });
});
