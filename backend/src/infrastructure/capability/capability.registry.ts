import type {
  CapabilityAnchor,
  CapabilityProcess,
  CapabilityRuntimeContribution,
} from '@app-types/common/capability.types';
import { Inject, Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  createCapabilityGraph,
  type CapabilityGraph,
  type CapabilityGraphIssue,
  validateCapabilityAnchors,
} from './capability-graph';
import {
  type CapabilityRuntimeIssue,
  validateCapabilityRuntimeContributions,
} from './capability-runtime';
import {
  CAPABILITY_ANCHOR_DISCOVERABLE,
  CAPABILITY_RUNTIME_CONTRIBUTION_DISCOVERABLE,
} from './capability.decorators';

export const CAPABILITY_PROCESS = Symbol('CAPABILITY_PROCESS');

@Injectable()
export class CapabilityRegistry {
  private anchors: readonly CapabilityAnchor[] | null = null;
  private runtimeContributions: readonly CapabilityRuntimeContribution[] | null = null;
  private graph: CapabilityGraph | null = null;

  constructor(
    @Inject(CAPABILITY_PROCESS)
    readonly process: CapabilityProcess,
    private readonly discoveryService: DiscoveryService,
  ) {}

  getAnchors(): readonly CapabilityAnchor[] {
    if (this.anchors) return this.anchors;
    this.anchors = this.discoverMetadata(CAPABILITY_ANCHOR_DISCOVERABLE);
    return this.anchors;
  }

  getRuntimeContributions(): readonly CapabilityRuntimeContribution[] {
    if (this.runtimeContributions) return this.runtimeContributions;
    this.runtimeContributions = this.discoverMetadata(CAPABILITY_RUNTIME_CONTRIBUTION_DISCOVERABLE);
    return this.runtimeContributions;
  }

  getGraph(): CapabilityGraph {
    if (!this.graph) this.graph = createCapabilityGraph(this.getAnchors());
    return this.graph;
  }

  getValidationIssues(): readonly (CapabilityGraphIssue | CapabilityRuntimeIssue)[] {
    return [
      ...validateCapabilityAnchors(this.getAnchors()),
      ...validateCapabilityRuntimeContributions({
        anchors: this.getAnchors(),
        contributions: this.getRuntimeContributions(),
      }),
    ];
  }

  private discoverMetadata<TMetadata>(
    decorator: ReturnType<typeof DiscoveryService.createDecorator<TMetadata>>,
  ): readonly TMetadata[] {
    const seenInstances = new Set<unknown>();
    return this.discoveryService.getProviders().flatMap((wrapper): readonly TMetadata[] => {
      const instance: unknown = wrapper.instance;
      if (instance === null || instance === undefined || seenInstances.has(instance)) return [];
      const metadata = this.discoveryService.getMetadataByDecorator(decorator, wrapper);
      if (!metadata) return [];
      seenInstances.add(instance);
      return [metadata];
    });
  }
}

export class CapabilityBootstrapError extends Error {
  constructor(
    readonly process: CapabilityProcess,
    readonly issues: readonly (CapabilityGraphIssue | CapabilityRuntimeIssue)[],
  ) {
    super(
      `Capability bootstrap validation failed for ${process}\n- ${issues
        .map((issue) => issue.message)
        .join('\n- ')}`,
    );
    this.name = 'CapabilityBootstrapError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
