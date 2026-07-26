import { PLAN } from './constants';

export function canUsePublicApi(planName: string | null | undefined): boolean {
  return planName === PLAN.ENTERPRISE;
}
