import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { handleErrorWithSentry } from '@sentry/sveltekit';

const dsn = env.PUBLIC_SENTRY_DSN?.trim();

if (dsn && !dev) {
  Sentry.init({
    dsn,
    environment: env.PUBLIC_SENTRY_ENVIRONMENT?.trim() || 'production',
    tracesSampleRate: Number(env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    replaysSessionSampleRate: Number(env.PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0),
    replaysOnErrorSampleRate: Number(env.PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 1),
    integrations: [Sentry.replayIntegration()]
  });
}

export const handleError = handleErrorWithSentry();
