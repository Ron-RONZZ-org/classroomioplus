// Self-hosted CSP defaults. Runtime domains are added via env vars in
// hooks.server.ts so pre-built Docker images stay configurable.

/**
 * @param {boolean} _isSelfHosted - unused, always true for this fork
 * @param {string | undefined} _serverUrl - unused
 */
export function getCspDomains(_isSelfHosted, _serverUrl) {
  return {
    scriptSrc: [],
    styleSrc: [],
    connectSrc: [],
    frameSrc: [],
    fontSrc: [],
    mediaSrc: [
      // External image hosts used by the app in self-hosted mode
      'https://images.unsplash.com',
      'https://api.dicebear.com',
      'https://cdn4.iconfinder.com',
      'https://assets.cdn.clsrio.com'
    ],
    apiOrigin: null
  };
}
