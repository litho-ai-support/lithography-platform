import type {
  CapabilityAnchor,
  CapabilityId,
  CapabilityProcess,
  CapabilityRootBlocker,
  CapabilityRuntimeContribution,
  CapabilityStateSnapshot,
} from '@app-types/common/capability.types';
import path from 'node:path';
import {
  createCapabilityGraph,
  resolveCapabilityStates,
  validateCapabilityAnchors,
} from './capability-graph';
import {
  aggregateCapabilityHealth,
  resolveCapabilityHealth,
  validateCapabilityRuntimeContributions,
} from './capability-runtime';

export interface CapabilityProcessTopology {
  readonly process: CapabilityProcess;
  readonly anchors: readonly CapabilityAnchor[];
  readonly contributions: readonly CapabilityRuntimeContribution[];
}

export interface CapabilityProcessProjection {
  readonly process: CapabilityProcess;
  readonly states: ReadonlyMap<CapabilityId, CapabilityStateSnapshot>;
}

export interface CapabilityProcessProjectionResult {
  readonly issues: readonly string[];
  readonly projections: readonly CapabilityProcessProjection[];
}

export function buildCapabilityProcessProjections(input: {
  readonly topologies: readonly CapabilityProcessTopology[];
  readonly disabledIds: ReadonlySet<CapabilityId>;
}): CapabilityProcessProjectionResult {
  const issues: string[] = [];
  const projections: CapabilityProcessProjection[] = [];

  for (const topology of input.topologies) {
    const graphIssues = validateCapabilityAnchors(topology.anchors);
    const runtimeIssues = validateCapabilityRuntimeContributions({
      anchors: topology.anchors,
      contributions: topology.contributions,
    });
    issues.push(
      ...graphIssues.map((issue) => `${issue.message}:${topology.process}`),
      ...runtimeIssues.map((issue) => `${issue.message}:${topology.process}`),
    );
    if (graphIssues.length > 0) continue;

    const states = resolveCapabilityStates({
      graph: createCapabilityGraph(topology.anchors),
      disabledIds: input.disabledIds,
    });
    projections.push({
      process: topology.process,
      states: new Map(
        [...states].map(([capabilityId, state]) => [
          capabilityId,
          {
            ...state,
            health: resolveCapabilityHealth({
              capabilityId,
              states,
              contributions: topology.contributions,
            }),
          },
        ]),
      ),
    });
  }

  return {
    issues: [...new Set(issues)],
    projections,
  };
}

export function aggregateCapabilityProcessState(input: {
  readonly capabilityId: CapabilityId;
  readonly projections: readonly CapabilityProcessProjection[];
}): CapabilityStateSnapshot {
  const states = input.projections.flatMap((projection) => {
    const state = projection.states.get(input.capabilityId);
    return state ? [state] : [];
  });
  if (states.length === 0) {
    throw new Error(`capability_process_state_missing:${input.capabilityId}`);
  }

  return {
    capabilityId: input.capabilityId,
    configuredState: states.some((state) => state.configuredState === 'disabled')
      ? 'disabled'
      : 'enabled',
    effectiveState: states.some((state) => state.effectiveState === 'disabled')
      ? 'disabled'
      : states.some((state) => state.effectiveState === 'blocked')
        ? 'blocked'
        : 'enabled',
    health: aggregateCapabilityHealth(states.map((state) => state.health)),
    rootBlockers: dedupeRootBlockers(states.flatMap((state) => state.rootBlockers)),
  };
}

export function resolveCapabilityDecisionHref(input: {
  readonly generatedDocumentRef: string;
  readonly decisionRef: string;
}): string {
  return path.posix.relative(path.posix.dirname(input.generatedDocumentRef), input.decisionRef);
}

function dedupeRootBlockers(
  blockers: readonly CapabilityRootBlocker[],
): readonly CapabilityRootBlocker[] {
  return [
    ...new Map(
      blockers.map((blocker) => [`${blocker.capabilityId}:${blocker.effectiveState}`, blocker]),
    ).values(),
  ].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
}
