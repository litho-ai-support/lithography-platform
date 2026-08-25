import type { CapabilityId, CapabilityStateSnapshot } from '@app-types/common/capability.types';
import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';
import { AiWorkerActivationUsecase } from './ai-worker-activation.usecase';
import { AiWorkflowWorkerActivationUsecase } from './ai-workflow-worker-activation.usecase';

const stateReader = (enabledIds: readonly CapabilityId[]): CapabilityStateReader => ({
  getState(capabilityId: CapabilityId): CapabilityStateSnapshot {
    const enabled = enabledIds.includes(capabilityId);
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

describe('capability-aware Worker activation', () => {
  it('keeps each processor behind its own explicit activation point', () => {
    const reader = stateReader(['ai.execution']);

    expect(new AiWorkerActivationUsecase(reader).shouldRun()).toBe(true);
    expect(new AiWorkflowWorkerActivationUsecase(reader).shouldRun()).toBe(false);
  });
});
