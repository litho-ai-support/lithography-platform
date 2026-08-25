import type { CapabilityAnchor, CapabilityProcess } from '@app-types/common/capability.types';
import {
  aggregateCapabilityProcessState,
  buildCapabilityProcessProjections,
  resolveCapabilityDecisionHref,
  type CapabilityProcessTopology,
} from './capability-process-projection';

describe('capability process projection', () => {
  it('rejects a semantic dependency installed only in another process', () => {
    const result = buildCapabilityProcessProjections({
      topologies: [
        topology('api', [anchor('feature.a', ['feature.b'])]),
        topology('worker', [anchor('feature.b')]),
      ],
      disabledIds: new Set(),
    });

    expect(result.issues).toContain('capability_requirement_unknown:feature.a:feature.b:api');
  });

  it('computes health per process before aggregating the observation', () => {
    const result = buildCapabilityProcessProjections({
      topologies: [
        topology(
          'api',
          [anchor('feature.a'), anchor('runtime.audit')],
          [
            {
              capabilityId: 'feature.a',
              runtimeDependencies: [{ capabilityId: 'runtime.audit', requirement: 'optional' }],
              queueResources: [],
            },
          ],
        ),
        topology(
          'worker',
          [anchor('feature.a')],
          [
            {
              capabilityId: 'feature.a',
              runtimeDependencies: [{ capabilityId: 'runtime.audit', requirement: 'optional' }],
              queueResources: [],
            },
          ],
        ),
      ],
      disabledIds: new Set(),
    });

    expect(result.issues).toEqual([]);
    expect(
      aggregateCapabilityProcessState({
        capabilityId: 'feature.a',
        projections: result.projections,
      }),
    ).toMatchObject({ effectiveState: 'enabled', health: 'degraded' });
  });

  it('links generated observations to the anchor decisionRef', () => {
    expect(
      resolveCapabilityDecisionHref({
        generatedDocumentRef: 'docs/generated/capabilities-current.md',
        decisionRef: 'docs/capabilities/ai-execution.md',
      }),
    ).toBe('../capabilities/ai-execution.md');
  });
});

function anchor(capabilityId: string, requires: readonly string[] = []): CapabilityAnchor {
  return {
    capabilityId,
    mode: 'switchable',
    decisionRef: 'docs/capabilities/current.md',
    requires,
  };
}

function topology(
  process: CapabilityProcess,
  anchors: readonly CapabilityAnchor[],
  contributions: CapabilityProcessTopology['contributions'] = [],
): CapabilityProcessTopology {
  return { process, anchors, contributions };
}
