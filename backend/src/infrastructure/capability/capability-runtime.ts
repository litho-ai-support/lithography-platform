import type {
  CapabilityAnchor,
  CapabilityHealthStatus,
  CapabilityId,
  CapabilityRuntimeContribution,
  CapabilityStateSnapshot,
} from '@app-types/common/capability.types';
import { BULLMQ_JOB_PAYLOAD_VALIDATORS } from '@src/infrastructure/bullmq/contracts/job-contract.registry';
import { BULLMQ_QUEUE_REGISTRY } from '@src/infrastructure/bullmq/queue-registry';

export type CapabilityRuntimeIssueCode =
  | 'CAPABILITY_RUNTIME_OWNER_UNKNOWN'
  | 'CAPABILITY_RUNTIME_DEPENDENCY_DUPLICATE'
  | 'CAPABILITY_RUNTIME_DEPENDENCY_SELF'
  | 'CAPABILITY_RUNTIME_DEPENDENCY_REQUIRED_UNKNOWN'
  | 'CAPABILITY_RUNTIME_DEPENDENCY_CYCLE'
  | 'CAPABILITY_RUNTIME_QUEUE_DUPLICATE'
  | 'CAPABILITY_RUNTIME_QUEUE_UNKNOWN'
  | 'CAPABILITY_RUNTIME_JOB_UNKNOWN';

export interface CapabilityRuntimeIssue {
  readonly code: CapabilityRuntimeIssueCode;
  readonly message: string;
  readonly capabilityId?: CapabilityId;
}

export function validateCapabilityRuntimeContributions(input: {
  readonly anchors: readonly CapabilityAnchor[];
  readonly contributions: readonly CapabilityRuntimeContribution[];
}): readonly CapabilityRuntimeIssue[] {
  const issues: CapabilityRuntimeIssue[] = [];
  const installedIds = new Set(input.anchors.map((anchor) => anchor.capabilityId));
  const requiredDependencies = new Map<CapabilityId, Set<CapabilityId>>();

  for (const contribution of input.contributions) {
    if (!installedIds.has(contribution.capabilityId)) {
      issues.push({
        code: 'CAPABILITY_RUNTIME_OWNER_UNKNOWN',
        capabilityId: contribution.capabilityId,
        message: `capability_runtime_owner_unknown:${contribution.capabilityId}`,
      });
    }

    const seenDependencies = new Set<CapabilityId>();
    for (const dependency of contribution.runtimeDependencies) {
      if (seenDependencies.has(dependency.capabilityId)) {
        issues.push({
          code: 'CAPABILITY_RUNTIME_DEPENDENCY_DUPLICATE',
          capabilityId: contribution.capabilityId,
          message: `capability_runtime_dependency_duplicate:${contribution.capabilityId}:${dependency.capabilityId}`,
        });
        continue;
      }
      seenDependencies.add(dependency.capabilityId);
      if (dependency.capabilityId === contribution.capabilityId) {
        issues.push({
          code: 'CAPABILITY_RUNTIME_DEPENDENCY_SELF',
          capabilityId: contribution.capabilityId,
          message: `capability_runtime_dependency_self:${contribution.capabilityId}`,
        });
        continue;
      }
      if (dependency.requirement === 'required') {
        if (!installedIds.has(dependency.capabilityId)) {
          issues.push({
            code: 'CAPABILITY_RUNTIME_DEPENDENCY_REQUIRED_UNKNOWN',
            capabilityId: contribution.capabilityId,
            message: `capability_runtime_dependency_required_unknown:${contribution.capabilityId}:${dependency.capabilityId}`,
          });
          continue;
        }
        const dependencies = requiredDependencies.get(contribution.capabilityId) ?? new Set();
        dependencies.add(dependency.capabilityId);
        requiredDependencies.set(contribution.capabilityId, dependencies);
      }
    }

    const seenQueues = new Set<string>();
    for (const resource of contribution.queueResources) {
      const resourceKey = `${resource.queueName}:${resource.jobName}`;
      if (seenQueues.has(resourceKey)) {
        issues.push({
          code: 'CAPABILITY_RUNTIME_QUEUE_DUPLICATE',
          capabilityId: contribution.capabilityId,
          message: `capability_runtime_queue_duplicate:${contribution.capabilityId}:${resourceKey}`,
        });
        continue;
      }
      seenQueues.add(resourceKey);
      if (!Object.hasOwn(BULLMQ_QUEUE_REGISTRY, resource.queueName)) {
        issues.push({
          code: 'CAPABILITY_RUNTIME_QUEUE_UNKNOWN',
          capabilityId: contribution.capabilityId,
          message: `capability_runtime_queue_unknown:${contribution.capabilityId}:${resource.queueName}`,
        });
        continue;
      }
      const validators = (BULLMQ_JOB_PAYLOAD_VALIDATORS as Readonly<Record<string, unknown>>)[
        resource.queueName
      ];
      if (
        validators === null ||
        typeof validators !== 'object' ||
        !Object.hasOwn(validators, resource.jobName)
      ) {
        issues.push({
          code: 'CAPABILITY_RUNTIME_JOB_UNKNOWN',
          capabilityId: contribution.capabilityId,
          message: `capability_runtime_job_unknown:${contribution.capabilityId}:${resource.queueName}:${resource.jobName}`,
        });
      }
    }
  }

  issues.push(...detectRequiredRuntimeCycles(requiredDependencies));
  return dedupeRuntimeIssues(issues);
}

export function resolveCapabilityHealth(input: {
  readonly capabilityId: CapabilityId;
  readonly states: ReadonlyMap<CapabilityId, CapabilityStateSnapshot>;
  readonly contributions: readonly CapabilityRuntimeContribution[];
}): CapabilityHealthStatus {
  const ownerState = input.states.get(input.capabilityId);
  if (ownerState?.effectiveState !== 'enabled') {
    return 'unknown';
  }
  const dependencies = input.contributions
    .filter((contribution) => contribution.capabilityId === input.capabilityId)
    .flatMap((contribution) => contribution.runtimeDependencies);
  if (dependencies.length === 0) {
    return 'unknown';
  }
  if (
    dependencies.some(
      (dependency) =>
        dependency.requirement === 'required' &&
        input.states.get(dependency.capabilityId)?.effectiveState !== 'enabled',
    )
  ) {
    return 'unhealthy';
  }
  if (
    dependencies.some(
      (dependency) =>
        dependency.requirement === 'optional' &&
        input.states.get(dependency.capabilityId)?.effectiveState !== 'enabled',
    )
  ) {
    return 'degraded';
  }
  return 'unknown';
}

export function aggregateCapabilityHealth(
  statuses: readonly CapabilityHealthStatus[],
): CapabilityHealthStatus {
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('healthy')) return 'healthy';
  return 'unknown';
}

function detectRequiredRuntimeCycles(
  dependenciesById: ReadonlyMap<CapabilityId, ReadonlySet<CapabilityId>>,
): readonly CapabilityRuntimeIssue[] {
  const issues: CapabilityRuntimeIssue[] = [];
  const visiting = new Set<CapabilityId>();
  const visited = new Set<CapabilityId>();

  const visit = (capabilityId: CapabilityId, path: readonly CapabilityId[]): void => {
    if (visiting.has(capabilityId)) {
      const cycleStart = path.indexOf(capabilityId);
      const cycle = [...path.slice(cycleStart), capabilityId];
      issues.push({
        code: 'CAPABILITY_RUNTIME_DEPENDENCY_CYCLE',
        capabilityId,
        message: `capability_runtime_dependency_cycle:${cycle.join('->')}`,
      });
      return;
    }
    if (visited.has(capabilityId)) return;
    visiting.add(capabilityId);
    for (const dependencyId of dependenciesById.get(capabilityId) ?? []) {
      visit(dependencyId, [...path, capabilityId]);
    }
    visiting.delete(capabilityId);
    visited.add(capabilityId);
  };

  for (const capabilityId of dependenciesById.keys()) visit(capabilityId, []);
  return issues;
}

function dedupeRuntimeIssues(
  issues: readonly CapabilityRuntimeIssue[],
): readonly CapabilityRuntimeIssue[] {
  return [...new Map(issues.map((issue) => [issue.message, issue])).values()];
}
