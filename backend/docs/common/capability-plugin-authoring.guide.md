<!-- docs/common/capability-plugin-authoring.guide.md -->

Purpose: Help a human decide whether a vertical capability boundary and runtime machinery are justified.
Read when: Considering a new capability, provider, queue, runtime switch, or reusable framework extension.
Authority: Non-normative. `capability.rules.md` and accepted capability decisions win.

# Capability Adoption Guide

The historical filename contains “plugin”, but this project no longer treats every capability as a plugin. A capability is first a semantic and operational observation boundary. Add runtime machinery only when a real behavior needs it.

## Start With The Smallest Shape

1. Keep ordinary behavior in the existing horizontal layers.
2. Name a capability only when it owns recognizable facts, a product result, or an independently operated resource.
3. Write the semantic decision and identify the owner-facing behavior.
4. If the behavior is switchable, put an explicit `requireEnabled` gate at that behavior boundary.
5. Add one Anchor only after the gate exists.
6. Add Runtime Contribution only for queue resources or same-process dependencies that validation can actually reconcile.

Stop at the earliest step that solves the problem. A provider class, handler map, queue producer, reusable contract, or configuration value does not by itself justify a new capability.

## Preserve Human Observation Points

Prefer code a reviewer can follow locally:

- a resolver calls a usecase;
- a usecase calls an owner-facing module service;
- that service performs the capability gate;
- a queue producer names its queue and job explicitly;
- a Worker processor starts with `autorun: false`;
- an activation usecase checks state and then starts the Worker.

Do not replace these points with a generic dispatcher, session builder, provider binding catalog, command/query/event bus, dynamic GraphQL surface registry, or raw string protocol merely to make the framework more uniform. Uniform indirection is justified only by a present production need that explicit calls cannot satisfy, and requires a separate human governance decision.

## Boundary Review

Ask:

- What fact, result, lifecycle, policy, or operated resource remains if dependencies are removed?
- Who changes it, and for what product or operational reason?
- Which nearest concerns must remain outside?
- Is disabling the whole function meaningful, or is only one provider/operation unavailable?
- Where will a human observe and gate admission or Worker activation?
- Does the proposed parent own behavior, or is it only a namespace?

If the answers describe only composition, reuse, or transport, keep the code as a usecase, module service, provider, contract, or queue integration.

## Provider And Queue Guidance

- Provider implementations stay behind the owner-facing service or registry. Provider availability is normally operation health, not a child capability.
- A queue is a capability only when the operated asynchronous resource is itself independently governed. Otherwise it is a runtime contribution to its owning capability.
- Queue names and job contracts remain authoritative in BullMQ infrastructure registries; capability metadata references them but never copies their payload schemas.
- API and Worker topology remain explicit. Capability state does not create a transport or hide a process boundary.

## Acceptance Checklist

- The semantic decision has direct human authorization.
- The ID is stable, meaningful, and not just a directory prefix.
- `requires` contains only hard semantic prerequisites and is transitively reduced.
- Every switchable owner-facing behavior has a nearby explicit gate.
- Disabled Workers do not claim jobs.
- Existing owner-facing calls and layer boundaries remain understandable without the capability registry.
- `npm run capability:list` gives a useful shallow view without pretending to own every file.
- Behavior tests cover enabled, disabled, and blocked paths where applicable.

If these conditions cannot be met, do not install the Anchor yet. Record the proposed migration in `plans/` and keep current behavior explicit.
