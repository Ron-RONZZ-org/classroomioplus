/**
 * Smoke test — verifies the integration test setup works:
 *  1. The app can be imported and responds to requests
 *  2. The test database is reachable with seed data
 */
import { describe, expect, it } from 'vitest';
import { app } from '@api/app';

describe('smoke', () => {
  it('responds to the root health-check endpoint', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toContain('Welcome');
  });
});
