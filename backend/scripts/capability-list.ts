/// <reference types="node" />

/* eslint-disable no-console -- Interactive observation command. */

import 'reflect-metadata';

import type {
  CapabilityAnchor,
  CapabilityId,
  CapabilityProcess,
  CapabilityRuntimeContribution,
  CapabilityStateSnapshot,
} from '@app-types/common/capability.types';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { DynamicModule, Provider, Type } from '@nestjs/common';
import { ApiModule } from '@src/bootstraps/api/api.module';
import { WorkerModule } from '@src/bootstraps/worker/worker.module';
import { validateCapabilityAnchors } from '@src/infrastructure/capability/capability-graph';
import {
  aggregateCapabilityProcessState,
  buildCapabilityProcessProjections,
  resolveCapabilityDecisionHref,
} from '@src/infrastructure/capability/capability-process-projection';
import {
  CAPABILITY_ANCHOR_METADATA_KEY,
  CAPABILITY_RUNTIME_CONTRIBUTION_METADATA_KEY,
} from '@src/infrastructure/capability/capability.decorators';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type Command = 'list' | 'docs' | 'check';

interface ProviderObservation {
  readonly process: CapabilityProcess;
  readonly moduleName: string;
  readonly providerType: Type<unknown>;
}

interface RuntimeObservation {
  readonly process: CapabilityProcess;
  readonly contribution: CapabilityRuntimeContribution;
}

interface AnchorObservation {
  readonly anchor: CapabilityAnchor;
  readonly modules: Set<string>;
  readonly processes: Set<CapabilityProcess>;
}

interface CapabilityViewEntry {
  readonly anchor: CapabilityAnchor;
  readonly entryModule: string;
  readonly processes: readonly CapabilityProcess[];
  readonly contributions: readonly RuntimeObservation[];
  readonly state: CapabilityStateSnapshot;
}

const PROJECT_ROOT = process.cwd();
const GENERATED_DOC_PATH = path.join(PROJECT_ROOT, 'docs/generated/capabilities-current.md');
const PROCESS_ORDER: readonly CapabilityProcess[] = ['api', 'worker'];

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  const entries = await collectCapabilityView();
  reportConfigurationWarnings(entries);
  const markdown = renderMarkdown(entries);
  if (command === 'list') {
    console.log(renderTable(entries));
    return;
  }
  if (command === 'docs') {
    await fs.mkdir(path.dirname(GENERATED_DOC_PATH), { recursive: true });
    await fs.writeFile(GENERATED_DOC_PATH, markdown, 'utf8');
    console.log(`Wrote ${toProjectPath(GENERATED_DOC_PATH)}`);
    return;
  }
  const current = await fs.readFile(GENERATED_DOC_PATH, 'utf8').catch(() => null);
  if (current !== markdown) {
    throw new Error('Generated capability docs are stale; run npm run capability:docs');
  }
  console.log(`Generated capability docs are current: ${toProjectPath(GENERATED_DOC_PATH)}`);
}

async function collectCapabilityView(): Promise<readonly CapabilityViewEntry[]> {
  const observations = (
    await Promise.all([
      collectProviderObservations('api', ApiModule),
      collectProviderObservations('worker', WorkerModule),
    ])
  ).flat();
  const anchorsById = new Map<CapabilityId, AnchorObservation>();
  const contributionsById = new Map<CapabilityId, RuntimeObservation[]>();

  for (const observation of observations) {
    const anchor = Reflect.getMetadata(CAPABILITY_ANCHOR_METADATA_KEY, observation.providerType) as
      CapabilityAnchor | undefined;
    if (anchor) {
      const current = anchorsById.get(anchor.capabilityId);
      if (current && JSON.stringify(current.anchor) !== JSON.stringify(anchor)) {
        throw new Error(`Capability anchor differs across processes: ${anchor.capabilityId}`);
      }
      const item = current ?? {
        anchor,
        modules: new Set<string>(),
        processes: new Set<CapabilityProcess>(),
      };
      item.modules.add(observation.moduleName);
      item.processes.add(observation.process);
      anchorsById.set(anchor.capabilityId, item);
    }
    const contribution = Reflect.getMetadata(
      CAPABILITY_RUNTIME_CONTRIBUTION_METADATA_KEY,
      observation.providerType,
    ) as CapabilityRuntimeContribution | undefined;
    if (contribution) {
      const items = contributionsById.get(contribution.capabilityId) ?? [];
      if (
        !items.some(
          (item) =>
            item.process === observation.process &&
            JSON.stringify(item.contribution) === JSON.stringify(contribution),
        )
      ) {
        items.push({ process: observation.process, contribution });
      }
      contributionsById.set(contribution.capabilityId, items);
    }
  }

  const anchors = [...anchorsById.values()].map((item) => item.anchor);
  // This command is a composition/observation entry point, so reading deployment
  // configuration here mirrors the API and Worker bootstraps.
  // eslint-disable-next-line local-architecture/no-runtime-config-outside-wiring
  const disabledIds = new Set(parseCsv(process.env.CAPABILITY_DISABLED_IDS));
  const processProjection = buildCapabilityProcessProjections({
    topologies: PROCESS_ORDER.map((processName) => ({
      process: processName,
      anchors: [...anchorsById.values()]
        .filter((item) => item.processes.has(processName))
        .map((item) => item.anchor),
      contributions: [...contributionsById.values()]
        .flat()
        .filter((item) => item.process === processName)
        .map((item) => item.contribution),
    })),
    disabledIds,
  });
  const graphIssues = validateCapabilityAnchors(anchors);
  const decisionIssues = await validateDecisionReferences(anchors);
  const moduleIssues = [...anchorsById.entries()].flatMap(([capabilityId, item]) =>
    item.modules.size === 1 ? [] : [`capability_entry_module_ambiguous:${capabilityId}`],
  );
  const issues = [
    ...graphIssues.map((item) => item.message),
    ...processProjection.issues,
    ...decisionIssues,
    ...moduleIssues,
  ];
  if (issues.length > 0) {
    throw new Error(`Capability observation failed\n- ${issues.join('\n- ')}`);
  }

  return [...anchorsById.entries()]
    .map(([capabilityId, item]) => {
      return {
        anchor: item.anchor,
        entryModule: [...item.modules][0] ?? '',
        processes: sortProcesses(item.processes),
        contributions: contributionsById.get(capabilityId) ?? [],
        state: aggregateCapabilityProcessState({
          capabilityId,
          projections: processProjection.projections,
        }),
      };
    })
    .sort((left, right) => left.anchor.capabilityId.localeCompare(right.anchor.capabilityId));
}

async function collectProviderObservations(
  processName: CapabilityProcess,
  rootModule: Type<unknown>,
): Promise<readonly ProviderObservation[]> {
  const observations: ProviderObservation[] = [];
  const visitedModules = new Set<Type<unknown>>();
  const visitedDynamicModules = new Set<DynamicModule>();

  const observe = (moduleType: Type<unknown>, providers: readonly Provider[]): void => {
    for (const provider of providers) {
      const providerType = readProviderType(provider);
      if (providerType)
        observations.push({ process: processName, moduleName: moduleType.name, providerType });
    }
  };

  const visit = async (definition: unknown): Promise<void> => {
    const forwardResolved = unwrapForwardReference(definition);
    const resolved = isPromiseLike(forwardResolved) ? await forwardResolved : forwardResolved;
    if (isDynamicModule(resolved)) {
      if (visitedDynamicModules.has(resolved)) return;
      visitedDynamicModules.add(resolved);
      await visit(resolved.module);
      observe(resolved.module, resolved.providers ?? []);
      for (const imported of resolved.imports ?? []) await visit(imported);
      return;
    }
    if (typeof resolved !== 'function') return;
    const moduleType = resolved as Type<unknown>;
    if (visitedModules.has(moduleType)) return;
    visitedModules.add(moduleType);
    observe(
      moduleType,
      readMetadata<readonly Provider[]>(moduleType, MODULE_METADATA.PROVIDERS) ?? [],
    );
    for (const imported of readMetadata<readonly unknown[]>(moduleType, MODULE_METADATA.IMPORTS) ??
      []) {
      await visit(imported);
    }
  };

  await visit(rootModule);
  return observations;
}

function renderTable(entries: readonly CapabilityViewEntry[]): string {
  const rows = entries.map((entry) => [
    entry.anchor.capabilityId,
    entry.anchor.mode,
    entry.state.configuredState ?? '-',
    entry.state.effectiveState,
    entry.state.health,
    entry.state.rootBlockers
      .map((item) => `${item.capabilityId}(${item.effectiveState})`)
      .join(',') || '-',
    entry.entryModule,
    entry.processes.join(','),
    renderResources(entry),
    entry.anchor.decisionRef,
  ]);
  const headers = [
    'Capability',
    'Mode',
    'Configured',
    'Effective',
    'Health',
    'Root blockers',
    'Entry module',
    'Processes',
    'Resources',
    'Decision',
  ];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  return [headers, widths.map((width) => '-'.repeat(width)), ...rows]
    .map((row) => row.map((value, index) => value.padEnd(widths[index] ?? 0)).join(' | '))
    .join('\n');
}

function renderMarkdown(entries: readonly CapabilityViewEntry[]): string {
  const lines = [
    '<!-- generated by npm run capability:docs; do not edit manually -->',
    '',
    '# Current Capabilities',
    '',
    'This shallow projection is derived from the Nest API and Worker module graphs. Entry Module is a navigation seed, not a file-level ownership claim.',
    '',
    '| ID | Mode | Configured | Effective | Health | Root Blockers | Entry Module | Processes | Runtime Resources | Decision Ref |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entries.map(
      (entry) =>
        `| ${entry.anchor.capabilityId} | ${entry.anchor.mode} | ${entry.state.configuredState ?? '-'} | ${entry.state.effectiveState} | ${entry.state.health} | ${entry.state.rootBlockers.map((item) => `${item.capabilityId}(${item.effectiveState})`).join(', ') || '-'} | ${entry.entryModule} | ${entry.processes.join(', ')} | ${renderResources(entry)} | [${entry.anchor.decisionRef}](${resolveCapabilityDecisionHref({ generatedDocumentRef: toProjectPath(GENERATED_DOC_PATH), decisionRef: entry.anchor.decisionRef })}) |`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function renderResources(entry: CapabilityViewEntry): string {
  const resources = entry.contributions.flatMap((item) => [
    ...item.contribution.runtimeDependencies.map(
      (dependency) =>
        `${item.process}:dependency:${dependency.requirement}:${dependency.capabilityId}`,
    ),
    ...item.contribution.queueResources.map(
      (resource) => `${item.process}:queue:${resource.queueName}/${resource.jobName}`,
    ),
  ]);
  return [...new Set(resources)].join(';') || '-';
}

async function validateDecisionReferences(
  anchors: readonly CapabilityAnchor[],
): Promise<readonly string[]> {
  const issues: string[] = [];
  for (const anchor of anchors) {
    const absolutePath = path.join(PROJECT_ROOT, anchor.decisionRef);
    const content = await fs.readFile(absolutePath, 'utf8').catch(() => null);
    if (!content) {
      issues.push(`capability_decision_missing:${anchor.capabilityId}:${anchor.decisionRef}`);
      continue;
    }
    if (!content.includes(`## \`${anchor.capabilityId}\``)) {
      issues.push(
        `capability_decision_heading_missing:${anchor.capabilityId}:${anchor.decisionRef}`,
      );
    }
  }
  return issues;
}

function parseCommand(args: readonly string[]): Command {
  const command = args.filter((item) => item !== '--')[0] ?? 'list';
  if (command === 'list' || command === 'docs' || command === 'check') return command;
  throw new Error('Usage: capability-list.ts [list|docs|check]');
}

function parseCsv(raw: unknown): readonly string[] {
  if (typeof raw !== 'string') return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function reportConfigurationWarnings(entries: readonly CapabilityViewEntry[]): void {
  // eslint-disable-next-line local-architecture/no-runtime-config-outside-wiring
  const disabledIds = parseCsv(process.env.CAPABILITY_DISABLED_IDS);
  const anchorsById = new Map(entries.map((entry) => [entry.anchor.capabilityId, entry.anchor]));
  for (const capabilityId of disabledIds) {
    const anchor = anchorsById.get(capabilityId);
    if (!anchor) {
      console.warn(`capability_disabled_id_unknown:${capabilityId}`);
      continue;
    }
    if (anchor.mode === 'always-on') {
      console.warn(`capability_disabled_id_ignored_always_on:${capabilityId}`);
    }
  }
}

function sortProcesses(processes: ReadonlySet<CapabilityProcess>): readonly CapabilityProcess[] {
  return PROCESS_ORDER.filter((item) => processes.has(item));
}

function readProviderType(provider: Provider): Type<unknown> | null {
  if (typeof provider === 'function') return provider as Type<unknown>;
  if (
    provider &&
    typeof provider === 'object' &&
    'useClass' in provider &&
    typeof provider.useClass === 'function'
  ) {
    return provider.useClass as Type<unknown>;
  }
  if (
    provider &&
    typeof provider === 'object' &&
    'useExisting' in provider &&
    typeof provider.useExisting === 'function'
  ) {
    return provider.useExisting as Type<unknown>;
  }
  return null;
}

function readMetadata<T>(target: Type<unknown>, key: string): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

function unwrapForwardReference(value: unknown): unknown {
  if (value && typeof value === 'object' && 'forwardRef' in value) {
    const forwardRef = (value as { readonly forwardRef?: () => unknown }).forwardRef;
    if (typeof forwardRef === 'function') return forwardRef();
  }
  return value;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof value === 'object' && 'then' in value);
}

function isDynamicModule(value: unknown): value is DynamicModule {
  return Boolean(value && typeof value === 'object' && 'module' in value);
}

function toProjectPath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join('/');
}

void main();
