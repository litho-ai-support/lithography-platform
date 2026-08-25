import type {
  CapabilityAnchor,
  CapabilityRuntimeContribution,
  CapabilityStateSnapshot,
} from '@app-types/common/capability.types';
import {
  aggregateCapabilityHealth,
  resolveCapabilityHealth,
  validateCapabilityRuntimeContributions,
} from './capability-runtime';

describe('capability runtime contributions', () => {
  it('validates owners, duplicate/self/required dependencies, cycles, and BullMQ resources', () => {
    const issues = validateCapabilityRuntimeContributions({
      anchors: [anchor('feature-a'), anchor('feature-b')],
      contributions: [
        contribution('feature-a', {
          dependencies: [
            { capabilityId: 'feature-a', requirement: 'required' },
            { capabilityId: 'feature-b', requirement: 'required' },
            { capabilityId: 'feature-b', requirement: 'required' },
            { capabilityId: 'missing', requirement: 'required' },
          ],
          queueResources: [
            { queueName: 'missing-queue', jobName: 'missing-job' },
            { queueName: 'missing-queue', jobName: 'missing-job' },
          ],
        }),
        contribution('feature-b', {
          dependencies: [{ capabilityId: 'feature-a', requirement: 'required' }],
          queueResources: [{ queueName: 'email', jobName: 'missing-job' }],
        }),
        contribution('missing-owner', {
          dependencies: [],
          queueResources: [],
        }),
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'CAPABILITY_RUNTIME_OWNER_UNKNOWN',
        'CAPABILITY_RUNTIME_DEPENDENCY_DUPLICATE',
        'CAPABILITY_RUNTIME_DEPENDENCY_SELF',
        'CAPABILITY_RUNTIME_DEPENDENCY_REQUIRED_UNKNOWN',
        'CAPABILITY_RUNTIME_DEPENDENCY_CYCLE',
        'CAPABILITY_RUNTIME_QUEUE_DUPLICATE',
        'CAPABILITY_RUNTIME_QUEUE_UNKNOWN',
        'CAPABILITY_RUNTIME_JOB_UNKNOWN',
      ]),
    );
  });

  it('allows an optional dependency to be absent and projects degraded health', () => {
    const states = new Map<string, CapabilityStateSnapshot>([['owner', state('owner', 'enabled')]]);
    const runtimeContribution = contribution('owner', {
      dependencies: [{ capabilityId: 'optional-runtime', requirement: 'optional' }],
      queueResources: [{ queueName: 'email', jobName: 'send' }],
    });

    expect(
      validateCapabilityRuntimeContributions({
        anchors: [anchor('owner')],
        contributions: [runtimeContribution],
      }),
    ).toEqual([]);
    expect(
      resolveCapabilityHealth({
        capabilityId: 'owner',
        states,
        contributions: [runtimeContribution],
      }),
    ).toBe('degraded');
  });

  it('projects required loss and does not infer healthy liveness from valid assembly', () => {
    const states = new Map<string, CapabilityStateSnapshot>([
      ['owner', state('owner', 'enabled')],
      ['required-runtime', state('required-runtime', 'disabled')],
    ]);
    const runtimeContribution = contribution('owner', {
      dependencies: [{ capabilityId: 'required-runtime', requirement: 'required' }],
      queueResources: [{ queueName: 'email', jobName: 'send' }],
    });

    expect(
      resolveCapabilityHealth({
        capabilityId: 'owner',
        states,
        contributions: [runtimeContribution],
      }),
    ).toBe('unhealthy');

    states.set('required-runtime', state('required-runtime', 'enabled'));
    expect(
      resolveCapabilityHealth({
        capabilityId: 'owner',
        states,
        contributions: [runtimeContribution],
      }),
    ).toBe('unknown');
    expect(aggregateCapabilityHealth(['healthy', 'degraded'])).toBe('degraded');
    expect(aggregateCapabilityHealth(['healthy', 'unhealthy'])).toBe('unhealthy');
  });
});

function anchor(capabilityId: string): CapabilityAnchor {
  return {
    capabilityId,
    mode: 'switchable',
    decisionRef: 'docs/capabilities/current.md',
    requires: [],
  };
}

function contribution(
  capabilityId: string,
  input: {
    readonly dependencies: CapabilityRuntimeContribution['runtimeDependencies'];
    readonly queueResources: CapabilityRuntimeContribution['queueResources'];
  },
): CapabilityRuntimeContribution {
  return {
    capabilityId,
    runtimeDependencies: input.dependencies,
    queueResources: input.queueResources,
  };
}

function state(
  capabilityId: string,
  effectiveState: 'enabled' | 'disabled',
): CapabilityStateSnapshot {
  return {
    capabilityId,
    configuredState: effectiveState,
    effectiveState,
    health: 'unknown',
    rootBlockers:
      effectiveState === 'disabled' ? [{ capabilityId, effectiveState: 'disabled' }] : [],
  };
}
