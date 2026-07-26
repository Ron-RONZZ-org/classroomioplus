import { BaseApiWithErrors, classroomio } from '$lib/utils/services/api';
import { snackbar } from '$features/ui/snackbar/store';

import type { OrgAiProviderSettings } from '../utils/types';

class AiProviderApi extends BaseApiWithErrors {
  settings = $state<OrgAiProviderSettings | null>(null);
  loading = $state(false);
  saving = $state(false);

  async fetchSettings() {
    this.loading = true;

    try {
      await this.execute<(typeof classroomio.organization)['ai-provider']['$get']>({
        requestFn: () => classroomio.organization['ai-provider'].$get(),
        logContext: 'fetching AI provider settings',
        onSuccess: (response) => {
          this.settings = response.data;
        }
      });
    } finally {
      this.loading = false;
    }
  }

  async updateSettings(patch: Record<string, unknown>) {
    this.saving = true;

    try {
      await this.execute<(typeof classroomio.organization)['ai-provider']['$put']>({
        requestFn: () => classroomio.organization['ai-provider'].$put({ json: patch }),
        logContext: 'updating AI provider settings',
        onSuccess: (response) => {
          this.settings = response.data;
          this.errors = {};
          snackbar.success('snackbar.ai_provider.saved');
        },
        onError: (result) => {
          if (typeof result !== 'string' && 'field' in result && result.field) {
            this.errors[result.field] = result.error;
          }
        }
      });
    } finally {
      this.saving = false;
    }
  }
}

export const aiProviderApi = new AiProviderApi();
