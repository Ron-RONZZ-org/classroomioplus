export type OrgPlanLike = {
  planName: string | null;
  isActive: boolean | null;
};

export type IsOrgOnFreePlanOptions = {
  plans?: OrgPlanLike[] | null;
  orgId?: string | null;
};

export function isOrgOnFreePlan({ orgId }: IsOrgOnFreePlanOptions): boolean {
  if (!orgId) {
    return false;
  }

  // Self-hosted: no free plan restrictions
  return false;
}
