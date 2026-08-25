import type { CapabilityId, CapabilityStateSnapshot } from '@app-types/common/capability.types';

export const CAPABILITY_STATE_READER = Symbol('CAPABILITY_STATE_READER');

export interface CapabilityStateReader {
  getState(capabilityId: CapabilityId): CapabilityStateSnapshot;
  requireEnabled(capabilityId: CapabilityId): void;
}
