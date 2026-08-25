import type { CapabilityId, CapabilityStateSnapshot } from '@app-types/common/capability.types';
import { CAPABILITY_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';

export function createEnabledCapabilityStateReader(): CapabilityStateReader {
  return createCapabilityStateReader(new Set());
}

export function createDisabledCapabilityStateReader(
  ...disabledIds: readonly CapabilityId[]
): CapabilityStateReader {
  return createCapabilityStateReader(new Set(disabledIds));
}

function createCapabilityStateReader(
  disabledIds: ReadonlySet<CapabilityId>,
): CapabilityStateReader {
  const getState = (capabilityId: CapabilityId): CapabilityStateSnapshot => {
    const disabled = disabledIds.has(capabilityId);
    return {
      capabilityId,
      configuredState: disabled ? 'disabled' : 'enabled',
      effectiveState: disabled ? 'disabled' : 'enabled',
      health: 'unknown',
      rootBlockers: disabled ? [{ capabilityId, effectiveState: 'disabled' }] : [],
    };
  };
  return {
    getState,
    requireEnabled(capabilityId): void {
      const state = getState(capabilityId);
      if (state.effectiveState !== 'enabled') {
        throw new DomainError(CAPABILITY_ERROR.UNAVAILABLE, 'Capability is unavailable', state);
      }
    },
  };
}
