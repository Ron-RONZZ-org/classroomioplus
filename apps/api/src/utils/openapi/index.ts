import { Hono } from 'hono';
import { Scalar } from '@scalar/hono-api-reference';
import { openAPIRouteHandler } from 'hono-openapi';
import { env } from '@cio/core/config/env';
import { API_SERVER_URL } from '@api/constants';
import { AuthSession } from '@api/types/auth';

export function configureOpenAPI(app: Hono<AuthSession>) {
  if (env.OPENAPI_URL) {
    // Cloud/CDN deployment: serve docs pointing to hosted spec URL
    app.get('/docs', Scalar({ url: env.OPENAPI_URL, theme: 'none' }));
  } else {
    // Self-hosted/dev: generate OpenAPI spec from route decorators
    // and serve locally via Scalar UI.
    const specUrl = '/docs/openapi.json';

    app.get(
      specUrl,
      openAPIRouteHandler(app, {
        documentation: {
          info: {
            title: 'LibreClassroom API',
            version: '1.0.0',
            description: 'LibreClassroom API — self-hosted learning management system',
            contact: {
              name: 'LibreClassroom',
              url: 'https://libreclassroom.ronzz.org'
            }
          },
          servers: [{ url: API_SERVER_URL, description: 'This server' }]
        }
      })
    );

    app.get('/docs', Scalar({ url: specUrl, theme: 'none' }));
  }
}
