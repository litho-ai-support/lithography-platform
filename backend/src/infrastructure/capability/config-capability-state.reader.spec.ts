import type { CapabilityAnchor } from '@app-types/common/capability.types';
import { ConfigService } from '@nestjs/config';
import { CAPABILITY_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { createCapabilityGraph } from './capability-graph';
import { CapabilityRegistry } from './capability.registry';
import { ConfigCapabilityStateReader } from './config-capability-state.reader';

const anchors: readonly CapabilityAnchor[] = [
  {
    capabilityId: 'parent',
    mode: 'switchable',
    decisionRef: 'docs/capabilities/current.md',
    requires: [],
  },
  {
    capabilityId: 'child',
    mode: 'switchable',
    decisionRef: 'docs/capabilities/current.md',
    requires: ['parent'],
  },
  {
    capabilityId: 'required',
    mode: 'always-on',
    decisionRef: 'docs/capabilities/current.md',
    requires: [],
  },
];

describe(ConfigCapabilityStateReader.name, () => {
  const createReader = (disabledIds: readonly string[]): ConfigCapabilityStateReader => {
    const registry = {
      getGraph: () => createCapabilityGraph(anchors),
      getRuntimeContributions: () => [],
    } as unknown as CapabilityRegistry;
    const config = {
      get: (key: string): unknown =>
        key === 'capabilityRuntime.disabledIds' ? disabledIds : undefined,
    } as ConfigService;
    return new ConfigCapabilityStateReader(registry, config);
  };

  it('keeps configured intent while a prerequisite blocks effective state', () => {
    expect(createReader(['parent']).getState('child')).toMatchObject({
      configuredState: 'enabled',
      effectiveState: 'blocked',
      rootBlockers: [{ capabilityId: 'parent', effectiveState: 'disabled' }],
    });
  });

  it('throws the stable capability error at an explicit behavior gate', () => {
    expect(() => createReader(['parent']).requireEnabled('child')).toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: CAPABILITY_ERROR.UNAVAILABLE }),
    );
  });

  it('warns for installed always-on IDs without misclassifying another process', () => {
    expect(createReader(['missing', 'required']).getConfigurationWarnings()).toEqual([
      expect.objectContaining({
        code: 'CAPABILITY_DISABLED_ID_ALWAYS_ON',
        capabilityId: 'required',
      }),
    ]);
  });
});
