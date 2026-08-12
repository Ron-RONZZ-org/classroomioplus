import { z } from 'zod';

/**
 * Validation schema for org-level AI provider settings.
 *
 * Stored in `organization.settings.aiProvider` as a list of named profiles.
 * Profiles override env-var defaults for self-hosted instances that want to
 * configure providers via the admin UI. `{ reset: true }` clears the stored
 * profiles and falls back to the built-in default profiles + env vars.
 */
export const ZAiProviderProfile = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  provider: z.enum(['openai', 'anthropic', 'google', 'moonshot', 'deepseek']),
  baseURL: z.string().url().optional().or(z.literal('')),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  isDefault: z.boolean().optional().default(false)
});

export const ZAiProviderSettings = z.union([
  z.object({
    profiles: z
      .array(ZAiProviderProfile)
      .min(1)
      .max(20)
      .superRefine((profiles, ctx) => {
        const defaultProfiles = profiles.filter((profile) => profile.isDefault);
        if (defaultProfiles.length > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Only one AI provider profile can be the default.',
            path: ['profiles']
          });
        }
      })
  }),
  z.object({
    reset: z.literal(true)
  })
]);

export type TAiProviderProfile = z.infer<typeof ZAiProviderProfile>;
export type TAiProviderSettings = z.infer<typeof ZAiProviderSettings>;
