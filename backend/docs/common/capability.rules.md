<!-- docs/common/capability.rules.md -->

Purpose: Define semantic capability boundaries, executable prerequisites, code anchors, runtime contributions, and the human observation window.
Read when: Identifying, naming, splitting, merging, installing, disabling, or reviewing a capability, or changing capability-aware providers, queues, health, or process assembly.
Source of truth: This file governs capability admission and implementation shape. Accepted per-capability semantics belong in `docs/capabilities/*.md`; active hypotheses and migration work belong in `plans/`.

# Capability Rules

## Governing Principle

- Derive facts that the module graph or an existing runtime registry already knows.
- Declare only decisions that code or validation executes.
- Keep semantic explanation in stable capability decision documents, not provider metadata.
- Capability is a vertical functional boundary over the existing horizontal layers. It is not another layer, dispatcher framework, plugin container, or authorization system.
- Preserve explicit owner-facing calls and activation points when they give humans a useful place to inspect, stop, or change behavior.

## Decision Authority

Creating, splitting, merging, deleting, renaming, reclassifying, or changing the mode of a capability is a semantic governance decision. It requires one of:

- an accepted decision under `docs/capabilities/`;
- an explicit human-approved active plan;
- a direct human decision in the current task.

An agent may collect evidence, identify inconsistencies, propose boundaries, and execute an authorized migration. It must not accept its own proposal or infer a capability from directory shape, dependencies, or runtime convenience. Temporary migration state stays in `plans/`; accepted semantics move to `docs/capabilities/`.

## Horizontal And Vertical Boundaries

- Horizontal layers answer technical responsibility: adapters handle protocol entry, usecases own orchestration and transactions, modules own same-domain reusable behavior and facts, infrastructure implements external/runtime concerns, and core/types contain pure rules and stable contracts.
- Vertical capabilities answer which recognizable business or technical function a change belongs to. A capability may cross layers but never changes their responsibilities.
- Capability is not a Nest module, ORM aggregate, GraphQL resolver, deployment process, or microservice synonym.
- Do not add a generic `capabilities` layer or runtime bus that wraps ordinary calls between the existing layers.

## Capability Admission

A capability owns at least one independently recognizable subject:

- cohesive business facts with lifecycle, rules, and read/write semantics;
- a recognizable product result with independent state, policy, or lifecycle;
- an independently installed or operated provider, queue, transport, or operation surface;
- an unavoidable cross-domain platform fact or control-plane behavior.

An entity, query, helper, dependency cycle, directory, or consumer demand is not sufficient evidence. Shared codecs, policies, composition usecases, transactions, dispatchers, facades, providers, and runtime consumers are not capabilities by default.

Before assigning an ID, remove the candidate's dependencies from the model. If no recognizable fact, lifecycle, product result, policy, or operated resource remains, keep it as a usecase, read model, facade, shared support, provider implementation, or runtime contribution.

An upper-level capability is valid only when it owns facts or executes a real product-level enable/disable decision. A dotted namespace alone does not create a parent. Do not install an Anchor until canonical facts or resources, an owner-facing surface, prerequisites, and state reading exist; a switchable Anchor additionally requires real behavior gates.

## Facts, References, And Composition

Referencing another capability's fact does not transfer ownership or automatically create a hard prerequisite. Composition queries, imports, synchronization, dry-runs, prefills, and cross-domain transactions stay in usecases unless they establish an independent product result, policy, state, or lifecycle. A runtime consumer never acquires semantic ownership merely by handling a queue job.

Semantic references may be cyclic. Executable capability prerequisites are a separate graph and must be acyclic.

## Capability Decisions

An accepted decision document states, in product or operational language:

- the stable capability ID and recognizable function;
- owned facts, result, lifecycle, policy, or operated resource;
- the nearest non-goals needed to prevent boundary expansion;
- important referenced facts and hard prerequisites where they clarify composition.

Decision documents do not repeat file inventories, process lists, public import paths, or validation commands. Physical work stays in the active plan; horizontal rules, lint, and behavior tests govern implementation.

## Hierarchy And Prerequisites

If an installed ID has an installed proper dotted prefix, its nearest such prefix is the inferred parent. Parent state is an implicit hard prerequisite and must not be repeated in `requires`.

`requires` contains only hard capability prerequisites: when one is not effectively enabled, the dependent cannot provide its recognizable function and becomes `blocked`.

Do not put these in `requires`:

- a merely referenced fact;
- a provider needed by only one optional operation;
- an upstream source that only refreshes an already usable local fact;
- a DI provider, handler, queue, or transport dependency;
- a prerequisite already guaranteed by another parent or `requires` path.

Anchors must be transitively reduced. Validation rejects unknown IDs, self-dependencies, cycles, repeated parents, and redundant prerequisites. A blocked prerequisite stops new admission or activation, but does not invalidate immutable facts or snapshots already owned by the dependent. Terminal and drain operations may continue from those owned facts only through an explicit narrow drain entry, and only when their own required resources remain available. They must not read new facts from the blocked prerequisite, repair its queue, or widen the dependent's ordinary service gate.

## Capability Anchor

Every installed capability has one minimal `@CapabilityAnchorProvider(...)` decision anchor:

- `capabilityId`: stable lowercase dotted join key;
- `mode`: `always-on` or `switchable`;
- `decisionRef`: repository-relative `docs/capabilities/*.md` path containing the exact capability heading;
- `requires`: transitively reduced non-parent hard prerequisites.

The Anchor is a provider in one owner-facing entry module. Entry module and API/Worker reachability are derived from the Nest module graph, not copied into metadata.

`mode` and `requires` are executable decisions. Installing a switchable Anchor without a gate on every owner-facing behavior is invalid. Do not put summaries, non-goals, file lists, process lists, classifications, or public-surface inventories in Anchor metadata.

## State And Health

Every switchable capability defaults to configured `enabled`. `CAPABILITY_DISABLED_IDS` contains explicit disabled IDs.

Effective state is:

- `not_installed`: no Anchor exists in the evaluated topology;
- `disabled`: a switchable capability is explicitly disabled;
- `blocked`: configured enabled, but a parent or `requires` prerequisite is unavailable;
- `enabled`: installed, not disabled, and all hard prerequisites are enabled.

Disabling a prerequisite does not rewrite downstream configuration. Dependents retain enabled intent, report final root blockers, and recover automatically when blockers recover.

Health is orthogonal to effective state:

- `unknown`: no runtime contribution or active health evidence;
- `healthy`: explicit runtime health evidence succeeds;
- `degraded`: an optional runtime dependency is unavailable;
- `unhealthy`: the capability is enabled but a required runtime dependency cannot serve it.

Operation-level provider failure must not disable a whole capability. The affected owner-facing operation returns its stable unavailable result; health may degrade. Provider implementations remain ordinary implementations unless they independently pass capability admission.

A disabled Worker capability must not claim queued work. Capability-aware BullMQ processors start with `autorun: false` and are run by an explicit activation usecase only when `getState` reports effective `enabled`. Disabled startup remains a valid quiet state rather than a bootstrap error. This activation point is intentional observability, not removable boilerplate.

The observation command, which sees both production roots, warns for unknown disabled IDs. A process
warns when configuration targets an always-on capability installed in that process; it must not call
an ID unknown merely because the capability is installed only in the other process.

## Runtime Contribution

`@CapabilityRuntimeContributionProvider(...)` is optional. It declares only facts the registry executes or validates:

- required or optional same-process runtime dependencies;
- BullMQ queue/job resources.

Every contribution references an Anchor installed in that process. Required runtime dependencies must exist in that process and form no cycle. Optional dependency loss changes health, never configured or effective state.

Valid assembly and enabled dependencies prove presence, not liveness. Without an explicit active health signal, health remains `unknown`; Runtime Contribution alone must not manufacture `healthy`.

Semantic `requires` and runtime dependencies are different graphs. Queue/job names are checked against the BullMQ registries. Do not add providers, handlers, sessions, commands, queries, events, GraphQL surfaces, permissions, or general plugin bindings to contribution metadata. The framework must not duplicate registries that already own those facts.

## Calls And Physical Migration

- Same-capability calls remain ordinary usecase-to-module calls.
- Cross-capability business calls use an existing owner-facing surface or a narrow typed contract; no generic dispatcher or envelope is required.
- API-to-Worker work uses explicit queue transport and payload contracts.
- Runtime call direction does not redefine semantic ownership.
- Physical moves begin after semantic decisions and public surfaces are accepted.
- Bootstraps are composition roots: they may assemble process-specific modules and lifecycle activation, but they do not own business orchestration.

## Human Observation Window

`npm run capability:list` is the single interactive view. It shows:

- hierarchical ID and mode;
- configured intent, effective state, health, and final root blockers;
- derived owner entry module and installed processes;
- runtime contributions and declared resources;
- semantic decision reference.

The command validates and resolves semantic prerequisites, effective state, runtime dependencies,
and health independently for each production process before aggregating the display. The union of API
and Worker Anchors must never satisfy a dependency missing from one real process graph.

`npm run capability:docs` regenerates `docs/generated/capabilities-current.md`; `npm run capability:docs:check` verifies it. The generated projection is shallow navigation, not a file-level ownership catalog. The entry module is the code-navigation seed; semantic scope comes from the decision, and technical responsibility comes from horizontal layer rules.

Tool success never replaces human review of semantics, explicit gates, activation points, and behavior tests.

## Validation

- A human can identify each capability's fact or resource and its owner-facing behavior without reading a generic runtime graph.
- No capability exists only to remove a dependency cycle, collect unrelated reads, or represent a dispatcher/session mechanism.
- Every Anchor links to a stable decision and passes hierarchy, state, reachability, and runtime validation.
- Every switchable behavior has an explicit gate close to the owner-facing service or activation boundary.
- Optional runtime failure does not silently change configured or effective state.
- Worker disablement leaves backlog unclaimed and recoverable.

## Non-Goals

- Do not make every entity, provider, or usecase a capability.
- Do not create a capability solely to provide a namespace.
- Do not migrate ordinary calls to a dispatcher.
- Do not create a Runtime Manifest, generated responsibility dossier, or file-level ownership projection.
- Do not add generic session, permission, GraphQL surface, provider-binding, queue-binding, or operation registries without a real production behavior that cannot remain explicit.
- Do not install target Anchors before their facts, public surfaces, prerequisites, and state enforcement exist.
