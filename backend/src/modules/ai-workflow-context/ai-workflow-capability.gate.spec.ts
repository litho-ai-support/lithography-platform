import type { CapabilityStateSnapshot } from '@app-types/common/capability.types';
import { CAPABILITY_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';
import { requireAiWorkflowTerminalDrain } from './ai-workflow-capability.gate';

describe(requireAiWorkflowTerminalDrain.name, () => {
  it('allows owned terminal drain when AI execution is the only blocker', () => {
    expect(() =>
      requireAiWorkflowTerminalDrain(
        createReader({
          capabilityId: 'ai.workflow',
          configuredState: 'enabled',
          effectiveState: 'blocked',
          health: 'unknown',
          rootBlockers: [{ capabilityId: 'ai.execution', effectiveState: 'disabled' }],
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    {
      name: 'workflow is explicitly disabled',
      state: {
        capabilityId: 'ai.workflow',
        configuredState: 'disabled',
        effectiveState: 'disabled',
        health: 'unknown',
        rootBlockers: [{ capabilityId: 'ai.workflow', effectiveState: 'disabled' }],
      } satisfies CapabilityStateSnapshot,
    },
    {
      name: 'AI parent is disabled',
      state: {
        capabilityId: 'ai.workflow',
        configuredState: 'enabled',
        effectiveState: 'blocked',
        health: 'unknown',
        rootBlockers: [{ capabilityId: 'ai', effectiveState: 'disabled' }],
      } satisfies CapabilityStateSnapshot,
    },
    {
      name: 'Async Task required by reconciliation is disabled',
      state: {
        capabilityId: 'ai.workflow',
        configuredState: 'enabled',
        effectiveState: 'blocked',
        health: 'unknown',
        rootBlockers: [{ capabilityId: 'runtime.async-task', effectiveState: 'disabled' }],
      } satisfies CapabilityStateSnapshot,
    },
  ])('rejects terminal drain when $name', ({ state }) => {
    expect(() => requireAiWorkflowTerminalDrain(createReader(state))).toThrow(DomainError);
  });
});

function createReader(state: CapabilityStateSnapshot): CapabilityStateReader {
  return {
    getState: () => state,
    requireEnabled: () => {
      throw new DomainError(CAPABILITY_ERROR.UNAVAILABLE, 'Capability is unavailable');
    },
  };
}
