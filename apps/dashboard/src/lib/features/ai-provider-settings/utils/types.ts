import { classroomio, type InferResponseType } from '$lib/utils/services/api';

export type GetOrgAiProviderRequest = (typeof classroomio.organization)['ai-provider']['$get'];
export type UpdateOrgAiProviderRequest = (typeof classroomio.organization)['ai-provider']['$put'];

export type GetOrgAiProviderSuccess = Extract<InferResponseType<GetOrgAiProviderRequest>, { success: true }>;
export type OrgAiProviderSettings = GetOrgAiProviderSuccess['data'];
