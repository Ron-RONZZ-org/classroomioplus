import * as z from 'zod';

import { defineEmail } from '../send';
import { getDefaultTemplate } from '../templates';

export const forgotPasswordEmail = defineEmail({
  id: 'forgotPassword',
  subject: `Password reset notification - ${process.env.APP_NAME || 'LibreClassroom'}`,
  schema: z.object({
    email: z.email(),
    name: z.string().min(1),
    link: z.url()
  }),
  render: (fields) => {
    const content = `Hello ${fields.name},
    <p>You are receiving this email because you have requested a password reset for your ${process.env.APP_NAME || 'LibreClassroom'} account.</p>
    <p>Please click the button below to reset your password:</p>
    
    <div>
      <a class="button" href="${fields.link}">Reset my password</a>
    </div>

    <p>PS: If you did not initiate this request, please ignore this email or contact your workspace administrator.</p>
    `;

    return getDefaultTemplate(content);
  }
});
