import { BaseApiWithErrors, classroomio } from '$lib/utils/services/api';
import { snackbar } from '$features/ui/snackbar/store';

import type {
  ActivateAiProfileRequest,
  AiProfileRole,
  CreateAiProfileInput,
  CreateAiProfileRequest,
  CreateAiProviderInput,
  CreateAiProviderRequest,
  DeleteAiProfileRequest,
  DeleteAiProviderRequest,
  OrgAiProviderManagement,
  UpdateAiProfileInput,
  UpdateAiProfileRequest,
  UpdateAiProviderInput,
  UpdateAiProviderRequest
} from '../utils/types';

const aiProviderRoute = classroomio.organization['ai-provider'];

/**
 * API class for org-level AI provider & profile management.
 * Every mutation returns the full management collection, so the page state
 * stays consistent without local reconciliation.
 */
class AiProviderApi extends BaseApiWithErrors {
  data = $state<OrgAiProviderManagement | null>(null);
  loading = $state(false);
  saving = $state(false);

  async fetchManagement() {
    this.loading = true;

    try {
      await this.execute<(typeof aiProviderRoute)['$get']>({
        requestFn: () => aiProviderRoute.$get(),
        logContext: 'fetching AI provider settings',
        onSuccess: (response) => {
          this.data = response.data;
        }
      });
    } finally {
      this.loading = false;
    }
  }

  private applyResponse(data: OrgAiProviderManagement | null) {
    this.data = data;
    this.errors = {};
  }

  private handleError(result: unknown) {
    if (typeof result !== 'string' && result && 'field' in result && result.field) {
      this.errors[result.field as string] = result.error as string;
    }
  }

  async createProvider(input: CreateAiProviderInput) {
    this.saving = true;

    try {
      await this.execute<CreateAiProviderRequest>({
        requestFn: () => aiProviderRoute.providers.$post({ json: input }),
        logContext: 'creating AI provider',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.provider_created');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }

  async updateProvider(providerId: string, patch: UpdateAiProviderInput) {
    this.saving = true;

    try {
      await this.execute<UpdateAiProviderRequest>({
        requestFn: () => aiProviderRoute.providers[':providerId'].$put({ param: { providerId }, json: patch }),
        logContext: 'updating AI provider',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.provider_updated');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }

  async deleteProvider(providerId: string) {
    this.saving = true;

    try {
      await this.execute<DeleteAiProviderRequest>({
        requestFn: () => aiProviderRoute.providers[':providerId'].$delete({ param: { providerId } }),
        logContext: 'deleting AI provider',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.provider_deleted');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }

  async createProfile(input: CreateAiProfileInput) {
    this.saving = true;

    try {
      await this.execute<CreateAiProfileRequest>({
        requestFn: () => aiProviderRoute.profiles.$post({ json: input }),
        logContext: 'creating AI profile',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.profile_created');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }

  async updateProfile(profileId: string, patch: UpdateAiProfileInput) {
    this.saving = true;

    try {
      await this.execute<UpdateAiProfileRequest>({
        requestFn: () => aiProviderRoute.profiles[':profileId'].$put({ param: { profileId }, json: patch }),
        logContext: 'updating AI profile',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.profile_updated');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }

  async deleteProfile(profileId: string) {
    this.saving = true;

    try {
      await this.execute<DeleteAiProfileRequest>({
        requestFn: () => aiProviderRoute.profiles[':profileId'].$delete({ param: { profileId } }),
        logContext: 'deleting AI profile',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.profile_deleted');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }

  async activateProfile(profileId: string, role: AiProfileRole) {
    this.saving = true;

    try {
      await this.execute<ActivateAiProfileRequest>({
        requestFn: () => aiProviderRoute.profiles[':profileId'].activate.$put({ param: { profileId }, json: { role } }),
        logContext: 'activating AI profile',
        onSuccess: (response) => {
          this.applyResponse(response.data);
          snackbar.success('snackbar.ai_provider.profile_activated');
        },
        onError: (result) => this.handleError(result)
      });
    } finally {
      this.saving = false;
    }
  }
}

export const aiProviderApi = new AiProviderApi();
