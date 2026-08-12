import { classroomio, type InferResponseType } from '$lib/utils/services/api';

export type UpdateProfileRequest = typeof classroomio.account.profile.$put;
export type UpdateProfileSuccess = Extract<InferResponseType<UpdateProfileRequest>, { success: true }>;
export type UpdateProfileResponseProfile = UpdateProfileSuccess['profile'];

export type GetMemberEmailNotificationsRequest =
  (typeof classroomio.organization.member)['email-notifications']['$get'];
export type UpdateMemberEmailNotificationsRequest =
  (typeof classroomio.organization.member)['email-notifications']['$put'];

export type GetMemberEmailNotificationsSuccess = Extract<
  InferResponseType<GetMemberEmailNotificationsRequest>,
  { success: true }
>;
export type MemberEmailNotificationPreferences = GetMemberEmailNotificationsSuccess['data'];
