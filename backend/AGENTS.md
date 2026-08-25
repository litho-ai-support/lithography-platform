# Agent Instructions

This is the default project context for coding agents in this repository.
Keep it short and stable: project shape, non-negotiable boundaries, and where to load deeper rules.
Detailed or fast-changing rules belong in `docs/`.

## Start Here

- Read `docs/README.md` before implementation and route to the smallest relevant rule set.
- For GraphQL error/auth/session behavior, read `docs/api/graphql-error-contract-current.md`; it applies to every GraphQL interface.
- If multiple rule documents overlap, use `docs/common/rule-precedence.rules.md`.
- Do not use `docs/human/` as implementation guidance.
- Prefer existing code patterns and current ESLint rules over examples in stale plans or comments.

## Project Snapshot

- NestJS TypeScript backend with strict layered architecture.
- Primary API is GraphQL; runtime bootstraps are split into API and Worker.
- Main layers: `adapters`, `usecases`, `modules`, `infrastructure`, `core`, `types`.
- `src/types` is the global shared contract layer for stable cross-context types and
  framework-free domain enums that API adapters consume as runtime GraphQL enum values.
- Shared global types must be imported through `@app-types/*`.
- Boundary contract is a layer-owned dependency boundary pattern, not a standalone layer; new boundary files use `*.contract.ts`, not `*.port.ts`.

## Non-Negotiables

- Never introduce `any`; the project uses strict TypeScript and type-aware ESLint.
- Do not hardcode configuration, secrets, URLs, tokens, or credentials. Use configuration modules.
- Preserve existing comments unless removing them is clearly part of the change.
- Use `DomainError` / existing `error_code` values from `src/core/common/errors/domain-error`; do not throw bare strings for business errors.
- Do not return ORM entities or QueryBuilder objects outside modules.
- Do not put GraphQL, HTTP, Swagger, or other adapter decorators on ORM entities.
- Register runtime GraphQL schema artifacts, enums, and scalars in `src/adapters/api/graphql/schema/`, not in DTOs or resolvers.
- Capability boundaries are not agent-discretionary. Do not create, split, merge, delete, reclassify, or change a Capability mode without an accepted `docs/capabilities/` decision, an explicitly human-approved active plan, or direct human instruction. Agents may propose a change but must not accept their own proposal.

## Layer Ownership

- `adapters`: protocol entry only. Parse input, call usecases, map output. No business orchestration and no modules/infrastructure runtime imports.
  Type-only imports from the called usecase's adjacent `*.types.ts` execution contract and from same-domain `src/modules/<bounded-context>/<bounded-context>.types.ts` files are allowed when the detailed adapter rules allow them.
- `usecases`: business orchestration, write semantics, permissions for write flows, transactions, and cross-domain coordination.
- `modules`: same-domain reusable services, QueryServices, repository/entity encapsulation, DI assembly. No cross-domain business orchestration.
- `QueryService`: modules-layer read side only. It may read, authorize read visibility, and shape stable read output; it must not write. Usecases are its only upper-layer callers, adapters never call it, and same-bounded-context QueryServices may compose one another only through read-only, acyclic dependencies.
- `infrastructure`: external systems and runtime implementations such as ORM, queues, SDKs, config, logging, Redis, email, and GraphQL runtime setup.
- `core`: pure domain models, value objects, policies, core-owned boundary contracts, stable rules, and domain errors only. No framework, SDK, I/O, configuration reads, DI, or side effects.
- `types`: stable shared contracts and enums only. No framework, GraphQL, ORM, or core imports.
- Boundary contracts belong to the layer that owns the decision requiring the capability. Infrastructure implements or adapts them and may import only the boundary declaration, its token, and the minimum framework-free signature types; it must not import upper-layer implementations.

## Dependency Direction

- Allowed high-level flow: `adapters -> usecases -> modules -> infrastructure`.
- `adapters` may depend on `usecases`, `core`, and `types`; Core access is limited to pure policies,
  value objects, domain errors, constants, normalization helpers, and type contracts, and must not
  move business orchestration into the adapter. For input handling, adapters may only use Core for
  protocol-compatible pure parsing/validation; usecases still select scene business semantics.
- `usecases`, `modules`, and `infrastructure` may depend on `core` and `types` within their documented limits.
- `core` may depend only on core-local code and stable framework-free contracts through `@app-types/*` when allowed by the current docs and lint rules.
- `types -> types` only.
- Business `modules` may depend on `modules/common`, but not on other business-domain modules.
- `modules/common` must not depend on business-domain modules.
- `usecases -> usecases` is allowed only for same-domain orchestration, one hop deep.
- No layer may depend on `adapters`.

## Write, Read, And Transactions

- Put create, update, and delete behavior in usecases.
- Keep module write services granular; they may accept transaction context from a usecase but must not own global transaction entrypoints.
- Start and define transactions in usecases.
- Lift cross-domain reads and writes to a usecase; do not push them down into modules or infrastructure.
- Use QueryService for read-side view normalization and write-after-read output when a stable view exists.
- Treat outbox as an architectural option, not an existing reusable component.
- `TransactionRunner` is the current usecase-owned transaction boundary contract; do not introduce parallel `TransactionPort` / `UnitOfWork` aliases.
- Cross-capability calls use an existing owner-facing surface or a narrow typed contract. Do not introduce a generic Capability bus, dispatcher, envelope, or session registry for ordinary calls.
- A switchable capability must gate its real owner-facing behaviors explicitly. Capability-aware Workers use `autorun: false` and an activation usecase so disabled work remains unclaimed and observable.

## Type Placement

- Cross-context stable contracts and enums: `src/types`, imported as `@app-types/*`.
- Same bounded-context stable contracts shared across adapters/usecases/modules: `src/modules/<bounded-context>/<bounded-context>.types.ts`.
- Flow-local or unstable types: colocate near the usecase/module/core code that owns them.
- A usecase execution input/result shared only with its calling adapter stays in an adjacent `*.types.ts`; this does not make it a bounded-context-wide contract.
- GraphQL DTO/Input/Args/Result classes stay in adapter GraphQL directories and must not leak downward.
- In repository architecture vocabulary, `DTO` means an adapter-owned transport shape. QueryServices return Views/read models/snapshots; usecases return those stable read outputs or usecase-owned results/summaries, which adapters map to DTOs.
- Do not import implementation files just to reuse their exported types.

## Context Routing

Use `docs/README.md` as the source of task routing. Common routes:

- Layer or dependency changes: `docs/common/*.rules.md` plus `docs/api/adapters.rules.md` when GraphQL entry code changes.
- GraphQL error/auth/session response contract: `docs/api/graphql-error-contract-current.md` plus `docs/api/adapters.rules.md`.
- Boundary contract or port/contract naming: `docs/common/boundary-contract.rules.md`.
- Capability identity, anchors, prerequisites, explicit gates, runtime contributions, providers, queues, or Worker activation: `docs/common/capability.rules.md` plus the referenced decision under `docs/capabilities/`; when evaluating an authorized proposal or selecting the smallest implementation shape, also read `docs/common/capability-plugin-authoring.guide.md`; for an unaccepted boundary or phased migration, read `plans/README.md` and the matching human-approved active plan.
- QueryService or shared type placement: `docs/common/queryservice.rules.md` and `docs/common/type.rules.md`.
- Worker queues or async consumers: `docs/worker/*.rules.md` and queue/audit project conventions.
- Input or time normalization: `docs/project-convention/input-*.md` or `docs/project-convention/time-*.md`.
- Current API behavior: the matching `docs/api/*-current.md`.
- In-progress design: `plans/README.md`, then the specific current plan.

## Validation

- Prefer the narrowest behavior-scoped validation.
- For architecture lint coverage and file-scoped validation commands, see `docs/common/eslint-architecture-rules.md`.
- For a specific e2e slice, prefer `npm run test:e2e:file -- <path>` when applicable.
- Use `npm run typecheck` or `npm run lint` when narrow tests are unavailable or insufficient.
- Do not broaden the change set to fix unrelated failures.

## Project Commands

- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Core e2e: `npm run test:e2e:core`
- Worker e2e: `npm run test:e2e:worker`
- Smoke e2e: `npm run test:e2e:smoke`
- File-scoped e2e: `npm run test:e2e:file`
- Empty DB migration drill: `npm run migration:drill:empty-db`
