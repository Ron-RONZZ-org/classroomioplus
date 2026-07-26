import * as z from 'zod';

import { defineEmail } from '../send';
import { getDefaultTemplate } from '../templates';

export const welcomeEmail = defineEmail({
  id: 'welcome',
  subject: `Welcome to ${process.env.APP_NAME || 'LibreClassroom'}!`,
  schema: z.object({
    name: z.string().min(1)
  }),
  render: (fields) => {
    const appName = process.env.APP_NAME || 'LibreClassroom';
    const brandDomain = process.env.BRAND_ROOT_DOMAIN || 'libreclassroom.ronzz.org';
    const content = `
    <p>Dear ${fields.name},</p>
    <p>Welcome to ${appName}! We're excited to have you on board.</p>
    <p>
      ${appName} is an open-source learning management system built for educators,
      by educators. Start by creating your first course, inviting students, or
      exploring the features available in your workspace.
    </p>
    <div>
      <a class="button" href="https://${brandDomain}">Get started</a>
    </div>
  `;

    return getDefaultTemplate(content);
  }
});
