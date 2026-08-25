import type { CapabilityAnchor } from '@app-types/common/capability.types';
import {
  createCapabilityGraph,
  inferCapabilityParent,
  resolveCapabilityState,
  validateCapabilityAnchors,
} from './capability-graph';

const anchor = (
  capabilityId: string,
  input: Partial<Pick<CapabilityAnchor, 'mode' | 'requires'>> = {},
): CapabilityAnchor => ({
  capabilityId,
  mode: input.mode ?? 'switchable',
  decisionRef: 'docs/capabilities/current.md',
  requires: input.requires ?? [],
});

describe('capability graph', () => {
  it('infers only the nearest installed dotted parent', () => {
    const ids = new Set(['ai', 'ai.execution', 'identity.account']);

    expect(inferCapabilityParent('ai.execution', ids)).toBe('ai');
    expect(inferCapabilityParent('identity.account', ids)).toBeNull();
  });

  it('infers the nearest installed parent and reports its root blocker', () => {
    const graph = createCapabilityGraph([
      anchor('ai'),
      anchor('ai.execution'),
      anchor('runtime.async-task'),
      anchor('ai.workflow', { requires: ['runtime.async-task'] }),
    ]);

    const state = resolveCapabilityState({
      graph,
      disabledIds: new Set(['ai']),
      capabilityId: 'ai.workflow',
    });

    expect(state).toEqual({
      capabilityId: 'ai.workflow',
      configuredState: 'enabled',
      effectiveState: 'blocked',
      health: 'unknown',
      rootBlockers: [{ capabilityId: 'ai', effectiveState: 'disabled' }],
    });
  });

  it('does not disable an always-on capability from configuration', () => {
    const graph = createCapabilityGraph([anchor('identity.account', { mode: 'always-on' })]);

    expect(
      resolveCapabilityState({
        graph,
        disabledIds: new Set(['identity.account']),
        capabilityId: 'identity.account',
      }).effectiveState,
    ).toBe('enabled');
  });

  it('rejects dependency cycles', () => {
    const issues = validateCapabilityAnchors([
      anchor('one', { requires: ['two'] }),
      anchor('two', { requires: ['one'] }),
    ]);

    expect(issues.map((issue) => issue.code)).toContain('CAPABILITY_DEPENDENCY_CYCLE');
  });

  it('rejects prerequisites already guaranteed by another path', () => {
    const issues = validateCapabilityAnchors([
      anchor('base'),
      anchor('middle', { requires: ['base'] }),
      anchor('leaf', { requires: ['middle', 'base'] }),
    ]);

    expect(issues.map((issue) => issue.code)).toContain('CAPABILITY_DEPENDENCY_REDUNDANT');
  });

  it('rejects malformed runtime metadata even when TypeScript was bypassed', () => {
    const malformed = {
      ...anchor('malformed'),
      mode: 'sometimes',
    } as unknown as CapabilityAnchor;

    expect(validateCapabilityAnchors([malformed])).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CAPABILITY_MODE_INVALID' })]),
    );
  });

  it('reports a capability that is absent from the installed topology', () => {
    const state = resolveCapabilityState({
      graph: createCapabilityGraph([anchor('installed')]),
      disabledIds: new Set(),
      capabilityId: 'missing',
    });

    expect(state.effectiveState).toBe('not_installed');
    expect(state.rootBlockers).toEqual([
      { capabilityId: 'missing', effectiveState: 'not_installed' },
    ]);
  });
});
