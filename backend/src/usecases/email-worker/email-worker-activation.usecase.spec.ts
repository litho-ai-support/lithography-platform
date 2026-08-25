import type { CapabilityId, CapabilityStateSnapshot } from '@app-types/common/capability.types';
import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';
import { EmailWorkerActivationUsecase } from './email-worker-activation.usecase';

const stateReader = (enabled: boolean): CapabilityStateReader => ({
  getState(capabilityId: CapabilityId): CapabilityStateSnapshot {
    return {
      capabilityId,
      configuredState: enabled ? 'enabled' : 'disabled',
      effectiveState: enabled ? 'enabled' : 'disabled',
      health: 'unknown',
      rootBlockers: enabled ? [] : [{ capabilityId, effectiveState: 'disabled' }],
    };
  },
  requireEnabled: jest.fn(),
});

describe(EmailWorkerActivationUsecase.name, () => {
  it('exposes email Worker activation as an explicit state decision', () => {
    expect(new EmailWorkerActivationUsecase(stateReader(true)).shouldRun()).toBe(true);
    expect(new EmailWorkerActivationUsecase(stateReader(false)).shouldRun()).toBe(false);
  });
});
