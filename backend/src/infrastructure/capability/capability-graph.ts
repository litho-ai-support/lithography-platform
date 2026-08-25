import type {
  CapabilityAnchor,
  CapabilityId,
  CapabilityRootBlocker,
  CapabilityStateSnapshot,
} from '@app-types/common/capability.types';

const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
const CAPABILITY_DECISION_REF_PATTERN = /^docs\/capabilities\/[a-z0-9][a-z0-9.-]*\.md$/;

export type CapabilityGraphIssueCode =
  | 'CAPABILITY_ID_INVALID'
  | 'CAPABILITY_ID_DUPLICATE'
  | 'CAPABILITY_MODE_INVALID'
  | 'CAPABILITY_DECISION_REF_INVALID'
  | 'CAPABILITY_REQUIREMENT_DUPLICATE'
  | 'CAPABILITY_REQUIREMENT_UNKNOWN'
  | 'CAPABILITY_REQUIREMENT_SELF'
  | 'CAPABILITY_PARENT_REPEATED'
  | 'CAPABILITY_DEPENDENCY_CYCLE'
  | 'CAPABILITY_DEPENDENCY_REDUNDANT';

export interface CapabilityGraphIssue {
  readonly code: CapabilityGraphIssueCode;
  readonly capabilityId?: CapabilityId;
  readonly message: string;
}

export interface CapabilityGraph {
  readonly anchorsById: ReadonlyMap<CapabilityId, CapabilityAnchor>;
  readonly parentById: ReadonlyMap<CapabilityId, CapabilityId>;
  readonly dependenciesById: ReadonlyMap<CapabilityId, readonly CapabilityId[]>;
}

export function isValidCapabilityId(capabilityId: string): boolean {
  return CAPABILITY_ID_PATTERN.test(capabilityId);
}

export function validateCapabilityAnchors(
  anchors: readonly CapabilityAnchor[],
): readonly CapabilityGraphIssue[] {
  const issues: CapabilityGraphIssue[] = [];
  const anchorsById = new Map<CapabilityId, CapabilityAnchor>();

  for (const anchor of anchors) {
    if (!isValidCapabilityId(anchor.capabilityId)) {
      issues.push(issue('CAPABILITY_ID_INVALID', anchor.capabilityId));
    }
    if (anchor.mode !== 'always-on' && anchor.mode !== 'switchable') {
      issues.push(issue('CAPABILITY_MODE_INVALID', anchor.capabilityId, String(anchor.mode)));
    }
    if (!CAPABILITY_DECISION_REF_PATTERN.test(anchor.decisionRef)) {
      issues.push(
        issue('CAPABILITY_DECISION_REF_INVALID', anchor.capabilityId, anchor.decisionRef),
      );
    }
    if (anchorsById.has(anchor.capabilityId)) {
      issues.push(issue('CAPABILITY_ID_DUPLICATE', anchor.capabilityId));
      continue;
    }
    anchorsById.set(anchor.capabilityId, anchor);
  }

  const parentById = buildParentMap(new Set(anchorsById.keys()));
  const dependenciesById = new Map<CapabilityId, readonly CapabilityId[]>();
  for (const anchor of anchorsById.values()) {
    const parent = parentById.get(anchor.capabilityId);
    const seen = new Set<CapabilityId>();
    const requirements: CapabilityId[] = [];
    for (const requirement of anchor.requires) {
      if (seen.has(requirement)) {
        issues.push(issue('CAPABILITY_REQUIREMENT_DUPLICATE', anchor.capabilityId, requirement));
        continue;
      }
      seen.add(requirement);
      if (requirement === anchor.capabilityId) {
        issues.push(issue('CAPABILITY_REQUIREMENT_SELF', anchor.capabilityId));
        continue;
      }
      if (!anchorsById.has(requirement)) {
        issues.push(issue('CAPABILITY_REQUIREMENT_UNKNOWN', anchor.capabilityId, requirement));
        continue;
      }
      if (requirement === parent) {
        issues.push(issue('CAPABILITY_PARENT_REPEATED', anchor.capabilityId, requirement));
        continue;
      }
      requirements.push(requirement);
    }
    dependenciesById.set(anchor.capabilityId, parent ? [parent, ...requirements] : requirements);
  }

  const cycleIssues = detectCycles(dependenciesById);
  issues.push(...cycleIssues);
  if (cycleIssues.length === 0) {
    issues.push(...detectRedundantRequirements(anchorsById, dependenciesById));
  }
  return dedupeIssues(issues);
}

export function createCapabilityGraph(anchors: readonly CapabilityAnchor[]): CapabilityGraph {
  const issues = validateCapabilityAnchors(anchors);
  if (issues.length > 0) {
    throw new CapabilityGraphValidationError(issues);
  }
  const anchorsById = new Map(anchors.map((anchor) => [anchor.capabilityId, anchor] as const));
  const parentById = buildParentMap(new Set(anchorsById.keys()));
  const dependenciesById = new Map<CapabilityId, readonly CapabilityId[]>();
  for (const anchor of anchors) {
    const parent = parentById.get(anchor.capabilityId);
    dependenciesById.set(
      anchor.capabilityId,
      parent ? [parent, ...anchor.requires] : [...anchor.requires],
    );
  }
  return { anchorsById, parentById, dependenciesById };
}

export function resolveCapabilityStates(input: {
  readonly graph: CapabilityGraph;
  readonly disabledIds: ReadonlySet<CapabilityId>;
}): ReadonlyMap<CapabilityId, CapabilityStateSnapshot> {
  const states = new Map<CapabilityId, CapabilityStateSnapshot>();
  const resolve = (capabilityId: CapabilityId): CapabilityStateSnapshot => {
    const cached = states.get(capabilityId);
    if (cached) return cached;
    const anchor = input.graph.anchorsById.get(capabilityId);
    if (!anchor) return notInstalledState(capabilityId);
    if (anchor.mode === 'switchable' && input.disabledIds.has(capabilityId)) {
      const state: CapabilityStateSnapshot = {
        capabilityId,
        configuredState: 'disabled',
        effectiveState: 'disabled',
        health: 'unknown',
        rootBlockers: [{ capabilityId, effectiveState: 'disabled' }],
      };
      states.set(capabilityId, state);
      return state;
    }
    const dependencyStates = (input.graph.dependenciesById.get(capabilityId) ?? []).map(resolve);
    const rootBlockers = dedupeBlockers(dependencyStates.flatMap((state) => state.rootBlockers));
    const state: CapabilityStateSnapshot = {
      capabilityId,
      configuredState: 'enabled',
      effectiveState: rootBlockers.length > 0 ? 'blocked' : 'enabled',
      health: 'unknown',
      rootBlockers,
    };
    states.set(capabilityId, state);
    return state;
  };
  for (const capabilityId of input.graph.anchorsById.keys()) resolve(capabilityId);
  return states;
}

export function resolveCapabilityState(input: {
  readonly graph: CapabilityGraph;
  readonly disabledIds: ReadonlySet<CapabilityId>;
  readonly capabilityId: CapabilityId;
}): CapabilityStateSnapshot {
  if (!input.graph.anchorsById.has(input.capabilityId)) {
    return notInstalledState(input.capabilityId);
  }
  return (
    resolveCapabilityStates(input).get(input.capabilityId) ?? notInstalledState(input.capabilityId)
  );
}

export class CapabilityGraphValidationError extends Error {
  constructor(readonly issues: readonly CapabilityGraphIssue[]) {
    super(
      `Capability graph validation failed\n- ${issues.map((item) => item.message).join('\n- ')}`,
    );
    this.name = 'CapabilityGraphValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function buildParentMap(ids: ReadonlySet<CapabilityId>): Map<CapabilityId, CapabilityId> {
  const result = new Map<CapabilityId, CapabilityId>();
  for (const capabilityId of ids) {
    const parent = inferCapabilityParent(capabilityId, ids);
    if (parent) result.set(capabilityId, parent);
  }
  return result;
}

export function inferCapabilityParent(
  capabilityId: CapabilityId,
  installedIds: ReadonlySet<CapabilityId>,
): CapabilityId | null {
  const parts = capabilityId.split('.');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const candidate = parts.slice(0, index).join('.');
    if (installedIds.has(candidate)) return candidate;
  }
  return null;
}

function detectCycles(
  dependenciesById: ReadonlyMap<CapabilityId, readonly CapabilityId[]>,
): readonly CapabilityGraphIssue[] {
  const issues: CapabilityGraphIssue[] = [];
  const visiting = new Set<CapabilityId>();
  const visited = new Set<CapabilityId>();
  const visit = (capabilityId: CapabilityId, path: readonly CapabilityId[]): void => {
    if (visiting.has(capabilityId)) {
      const cycleStart = path.indexOf(capabilityId);
      const cycle = [...path.slice(cycleStart), capabilityId];
      issues.push(issue('CAPABILITY_DEPENDENCY_CYCLE', capabilityId, cycle.join('->')));
      return;
    }
    if (visited.has(capabilityId)) return;
    visiting.add(capabilityId);
    for (const dependency of dependenciesById.get(capabilityId) ?? []) {
      visit(dependency, [...path, capabilityId]);
    }
    visiting.delete(capabilityId);
    visited.add(capabilityId);
  };
  for (const capabilityId of dependenciesById.keys()) visit(capabilityId, []);
  return issues;
}

function detectRedundantRequirements(
  anchorsById: ReadonlyMap<CapabilityId, CapabilityAnchor>,
  dependenciesById: ReadonlyMap<CapabilityId, readonly CapabilityId[]>,
): readonly CapabilityGraphIssue[] {
  const issues: CapabilityGraphIssue[] = [];
  const reaches = (start: CapabilityId, target: CapabilityId, seen: Set<CapabilityId>): boolean => {
    if (start === target) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    return (dependenciesById.get(start) ?? []).some((item) => reaches(item, target, new Set(seen)));
  };
  for (const anchor of anchorsById.values()) {
    for (const requirement of anchor.requires) {
      const alternatives = (dependenciesById.get(anchor.capabilityId) ?? []).filter(
        (item) => item !== requirement,
      );
      if (alternatives.some((item) => reaches(item, requirement, new Set()))) {
        issues.push(issue('CAPABILITY_DEPENDENCY_REDUNDANT', anchor.capabilityId, requirement));
      }
    }
  }
  return issues;
}

function notInstalledState(capabilityId: CapabilityId): CapabilityStateSnapshot {
  return {
    capabilityId,
    configuredState: null,
    effectiveState: 'not_installed',
    health: 'unknown',
    rootBlockers: [{ capabilityId, effectiveState: 'not_installed' }],
  };
}

function dedupeBlockers(
  blockers: readonly CapabilityRootBlocker[],
): readonly CapabilityRootBlocker[] {
  return [
    ...new Map(
      blockers.map((item) => [`${item.capabilityId}:${item.effectiveState}`, item]),
    ).values(),
  ].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
}

function issue(
  code: CapabilityGraphIssueCode,
  capabilityId: CapabilityId,
  detail?: string,
): CapabilityGraphIssue {
  return {
    code,
    capabilityId,
    message: `${code.toLowerCase()}:${capabilityId}${detail ? `:${detail}` : ''}`,
  };
}

function dedupeIssues(issues: readonly CapabilityGraphIssue[]): readonly CapabilityGraphIssue[] {
  return [...new Map(issues.map((item) => [item.message, item])).values()];
}
