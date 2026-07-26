import { initPosthog, type PosthogBootstrapUser } from '$lib/utils/services/posthog';
import { initUmami } from '$lib/utils/services/umami';
import { initUserJot } from '$lib/utils/services/userjot';

let isTrackingInitialized = false;
let _telemetryEnabled = false;

export function setTelemetryEnabled(enabled: boolean): void {
  _telemetryEnabled = enabled;
}

function setupTracking(user?: PosthogBootstrapUser) {
  if (isTrackingInitialized) return;
  if (!_telemetryEnabled) return;

  isTrackingInitialized = true;

  initPosthog(user);
  initUmami();
}

export function setupAnalytics(user?: PosthogBootstrapUser) {
  initUserJot();
  setupTracking(user);
}
