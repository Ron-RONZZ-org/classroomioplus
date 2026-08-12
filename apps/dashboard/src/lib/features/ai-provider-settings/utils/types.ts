import { classroomio, type InferResponseType } from '$lib/utils/services/api';

export type GetOrgAiProviderManagementRequest = (typeof classroomio.organization)['ai-provider']['$get'];
export type GetOrgAiProviderManagementSuccess = Extract<
  InferResponseType<GetOrgAiProviderManagementRequest>,
  { success: true }
>;
export type OrgAiProviderManagement = GetOrgAiProviderManagementSuccess['data'];

export type OrgAiProvider = OrgAiProviderManagement['providers'][number];
export type OrgAiProfile = OrgAiProviderManagement['profiles'][number];
export type AiProfileRole = 'teacher' | 'student';

export type CreateAiProviderRequest = (typeof classroomio.organization)['ai-provider']['providers']['$post'];
export type UpdateAiProviderRequest =
  (typeof classroomio.organization)['ai-provider']['providers'][':providerId']['$put'];
export type DeleteAiProviderRequest =
  (typeof classroomio.organization)['ai-provider']['providers'][':providerId']['$delete'];

export type CreateAiProfileRequest = (typeof classroomio.organization)['ai-provider']['profiles']['$post'];
export type UpdateAiProfileRequest = (typeof classroomio.organization)['ai-provider']['profiles'][':profileId']['$put'];
export type DeleteAiProfileRequest =
  (typeof classroomio.organization)['ai-provider']['profiles'][':profileId']['$delete'];
export type ActivateAiProfileRequest =
  (typeof classroomio.organization)['ai-provider']['profiles'][':profileId']['activate']['$put'];

export type CreateAiProviderInput = {
  name: string;
  providerType: OrgAiProvider['providerType'];
  defaultBaseUrl?: string;
};
export type UpdateAiProviderInput = Partial<CreateAiProviderInput>;
export type CreateAiProfileInput = {
  name: string;
  providerId: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
};
export type UpdateAiProfileInput = Partial<CreateAiProfileInput>;
