import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';

const AI_WORKFLOW_DRAINABLE_ROOT_BLOCKERS = ['ai.execution'] as const;

export function requireAiWorkflowEnabled(reader: CapabilityStateReader): void {
  reader.requireEnabled('ai.workflow');
}

/**
 * Terminal reconciliation may use already-owned workflow facts when AI execution alone is disabled.
 * Explicit workflow/parent disablement and loss of Async Task remain non-drainable.
 */
export function requireAiWorkflowTerminalDrain(reader: CapabilityStateReader): void {
  const state = reader.getState('ai.workflow');
  if (state.effectiveState === 'enabled') return;
  if (
    state.effectiveState === 'blocked' &&
    state.configuredState === 'enabled' &&
    state.rootBlockers.length > 0 &&
    state.rootBlockers.every((blocker) =>
      AI_WORKFLOW_DRAINABLE_ROOT_BLOCKERS.includes(
        blocker.capabilityId as (typeof AI_WORKFLOW_DRAINABLE_ROOT_BLOCKERS)[number],
      ),
    )
  ) {
    return;
  }
  reader.requireEnabled('ai.workflow');
}
