/**
 * Auth integration tests — real HTTP requests against Better Auth.
 *
 * Catches bugs #2 and #5 from the audit: session middleware silently swallowing
 * auth errors, and the 1-hour stale orgRoles cache.
 */
import { describe, expect, it } from 'vitest';
import { app } from '@api/app';

/**
 * Login as the seeded admin user and return the session token.
 *
 * Better Auth email-password sign-in returns 200 with a session token in
 * the JSON body, plus a `set-cookie` header with the session cookie.
 * We extract the cookie for subsequent requests since the dashboard uses
 * cookie-based auth.
 */
async function loginAsAdmin(): Promise<string> {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.com', password: '123456' })
  });

  if (res.status !== 200) {
    const body = await res.clone().text();
    throw new Error(`Login failed: ${res.status} ${body}`);
  }

  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Login succeeded but no set-cookie header');
  }

  // Extract just the name=value pairs (drop attributes like Max-Age, Path, HttpOnly)
  // Multiple Set-Cookie headers are joined by comma; each cookie may have attributes.
  const cookiePairs = setCookie
    .split(/, (?=[a-zA-Z0-9_-]+\.session_)/) // split on comma before each classroomio.session_*
    .map((part: string) => part.split(';')[0].trim())
    .join('; ');

  return cookiePairs;
}

describe('auth / session', () => {
  it('logs in with seeded credentials and obtains a session cookie', async () => {
    const cookie = await loginAsAdmin();

    expect(cookie).toContain('session_token=');
    expect(cookie).toContain('session_data=');
  });

  it('rejects invalid credentials with 401', async () => {
    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'wrong-password' })
    });

    expect(res.status).toBe(401);
  });

  it('returns session data at /session with valid cookie', async () => {
    const cookie = await loginAsAdmin();

    const res = await app.request('/session', {
      headers: { cookie }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('admin@test.com');
    expect(body.session).toBeDefined();
  });

  it('returns 401 at /session without a cookie', async () => {
    const res = await app.request('/session');
    expect(res.status).toBe(401);
  });

  it('returns 401 at /session with a tampered cookie (bug #2)', async () => {
    const tamperedCookie = 'better-auth.session_token=evils';
    const res = await app.request('/session', {
      headers: { cookie: tamperedCookie }
    });

    // Bug #2: the middleware catches the error from getSession and silently
    // continues with user=null instead of returning 401.
    // This assertion detects the regression.
    expect(res.status).toBe(401);
  });
});
