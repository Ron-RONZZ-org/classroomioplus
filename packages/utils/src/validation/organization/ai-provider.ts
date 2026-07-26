import { z } from 'zod';

/**
 * Validation schema for org-level AI provider settings.
 *
 * Stored in `organization.settings.aiProvider`. Overrides env-var defaults
 * for self-hosted instances that want to configure providers via the admin UI.
 */
export const ZAiProviderSettings = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'moonshot', 'deepseek']).optional(),
  apiKey: z.string().min(1).optional(),
  baseURL: z.string().url().optional().or(z.literal('')),
  model: z.string().min(1).optional()
});

export type TAiProviderSettings = z.infer<typeof ZAiProviderSettings>;
