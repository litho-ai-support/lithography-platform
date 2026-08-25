export type CapabilityId = string;

export type CapabilityMode = 'always-on' | 'switchable';

export type CapabilityProcess = 'api' | 'worker';

export type CapabilityConfiguredState = 'enabled' | 'disabled';

export type CapabilityEffectiveState = 'not_installed' | 'disabled' | 'blocked' | 'enabled';

export type CapabilityHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'unhealthy';

export interface CapabilityAnchor {
  readonly capabilityId: CapabilityId;
  readonly mode: CapabilityMode;
  readonly decisionRef: string;
  readonly requires: readonly CapabilityId[];
}

export interface CapabilityRuntimeDependency {
  readonly capabilityId: CapabilityId;
  readonly requirement: CapabilityRuntimeDependencyRequirement;
}

export type CapabilityRuntimeDependencyRequirement = 'required' | 'optional';

export interface CapabilityQueueResource {
  readonly queueName: string;
  readonly jobName: string;
}

export interface CapabilityRuntimeContribution {
  readonly capabilityId: CapabilityId;
  readonly runtimeDependencies: readonly CapabilityRuntimeDependency[];
  readonly queueResources: readonly CapabilityQueueResource[];
}

export interface CapabilityRootBlocker {
  readonly capabilityId: CapabilityId;
  readonly effectiveState: 'not_installed' | 'disabled';
}

export interface CapabilityStateSnapshot {
  readonly capabilityId: CapabilityId;
  readonly configuredState: CapabilityConfiguredState | null;
  readonly effectiveState: CapabilityEffectiveState;
  readonly health: CapabilityHealthStatus;
  readonly rootBlockers: readonly CapabilityRootBlocker[];
}
