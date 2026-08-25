import type { CapabilityId, CapabilityStateSnapshot } from '@app-types/common/capability.types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CAPABILITY_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import type { CapabilityStateReader } from '@src/modules/common/capability-state-reader.contract';
import { resolveCapabilityState, resolveCapabilityStates } from './capability-graph';
import { resolveCapabilityHealth } from './capability-runtime';
import { CapabilityRegistry } from './capability.registry';

export interface CapabilityConfigurationWarning {
  readonly capabilityId: CapabilityId;
  readonly code: 'CAPABILITY_DISABLED_ID_ALWAYS_ON';
  readonly message: string;
}

@Injectable()
export class ConfigCapabilityStateReader implements CapabilityStateReader {
  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly configService: ConfigService,
  ) {}

  getState(capabilityId: CapabilityId): CapabilityStateSnapshot {
    const graph = this.capabilityRegistry.getGraph();
    const disabledIds = this.readDisabledIds();
    const states = resolveCapabilityStates({ graph, disabledIds });
    const state =
      states.get(capabilityId) ?? resolveCapabilityState({ graph, disabledIds, capabilityId });
    return {
      ...state,
      health: resolveCapabilityHealth({
        capabilityId,
        states,
        contributions: this.capabilityRegistry.getRuntimeContributions(),
      }),
    };
  }

  requireEnabled(capabilityId: CapabilityId): void {
    const state = this.getState(capabilityId);
    if (state.effectiveState === 'enabled') return;
    throw new DomainError(CAPABILITY_ERROR.UNAVAILABLE, 'Capability is unavailable', {
      capabilityId: state.capabilityId,
      configuredState: state.configuredState,
      effectiveState: state.effectiveState,
      rootBlockers: state.rootBlockers,
    });
  }

  getConfigurationWarnings(): readonly CapabilityConfigurationWarning[] {
    const anchorsById = this.capabilityRegistry.getGraph().anchorsById;
    const warnings: CapabilityConfigurationWarning[] = [];
    for (const capabilityId of this.readDisabledIds()) {
      const anchor = anchorsById.get(capabilityId);
      // Absence from one process is not proof that the ID is unknown. The
      // observation command sees both production roots and performs that check.
      if (!anchor) continue;
      if (anchor.mode === 'always-on') {
        warnings.push({
          capabilityId,
          code: 'CAPABILITY_DISABLED_ID_ALWAYS_ON',
          message: `capability_disabled_id_ignored_always_on:${this.capabilityRegistry.process}:${capabilityId}`,
        });
      }
    }
    return warnings;
  }

  private readDisabledIds(): ReadonlySet<CapabilityId> {
    const configured = this.configService.get<unknown>('capabilityRuntime.disabledIds');
    if (!Array.isArray(configured)) return new Set();
    return new Set(configured.filter((item): item is string => typeof item === 'string'));
  }
}
