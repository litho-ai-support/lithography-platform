<!-- file: docs/common/rule-precedence.rules.md -->

Purpose: Define precedence rules for resolving overlaps or conflicts across rule documents.
Read when: Multiple rule documents apply to the same change and guidance is not clearly aligned.
Do not read when: Only one rule document applies and there is no conflict to resolve.
Source of truth: This file defines rule precedence; other rule documents must not override this order
implicitly.

## Repository Guidance Scope

- Repository-tracked `AGENTS.md` is the stable agent entrypoint and non-negotiable summary. Detailed
  or fast-changing rules live in the routed `docs/**/*.rules.md` files and must not contradict it.
- A rule file's `Source of truth` header applies only to the concern declared by that file's
  `Purpose` / `Read when` scope. It does not make that file globally authoritative over `AGENTS.md`,
  another layer's ownership rules, or this precedence order.
- `docs/README.md` and `plans/README.md` are routers. They do not define architecture rules.
- This file resolves overlaps among repository-tracked guidance. Ignored editor, IDE, agent-local, or
  machine-local configuration is not a repository source of truth and cannot override tracked rules.
- `eslint.config.mjs` is the executable source of truth for what lint currently enforces. It does not
  silently redefine architectural intent: when lint and the resolved tracked rules differ, treat the
  mismatch as a governance defect and update them together.
- API `*-current.md` documents and capability decision documents define only their scoped current
  behavior or semantic decisions. They do not redefine horizontal layer ownership or dependency
  direction.
- Plans define task goals, scope, sequencing, migration stages, and deliverables. They do not define
  stable architecture rules and cannot override applicable tracked rules.
- `docs/deprecated/`, `docs/human/`, frontend alignment drafts, examples, comments, and completed-plan
  archives provide context only. They are not implementation guidance and cannot override applicable
  tracked rules or current behavior documents.

## Rule Precedence

Precedence resolves conflicts only.
If multiple documents apply and their guidance does not conflict, all applicable constraints remain in
force.

1. Layer-boundary rules take precedence.
   If two applicable documents assign different ownership to the same responsibility, follow the
   layer-boundary rule first.

2. Specialized rules override general rules only within their explicitly scoped concern.
   `docs/worker/worker-usecase.rules.md` overrides conflicting parts of `docs/common/usecase.rules.md`
   only for explicitly defined worker-specific execution concerns, such as lifecycle handling, runtime
   input, and retry/failure recording.
   `docs/common/usecase-write-flow-boundaries.rules.md` overrides conflicting parts of
   `docs/common/usecase.rules.md` only for write-flow split and transaction-root boundary concerns in
   non-worker and general usecase orchestration scenarios.
   All other constraints in `docs/common/usecase.rules.md` remain in force.

3. `docs/project-convention/` is a repository-local refinement of `docs/common/`, not a replacement
   for it.
   It may override only repository-specific implementation details in `docs/common/`, such as naming,
   file placement, delivery conventions, and repository workflow constraints.
   It must not redefine layer ownership, dependency direction, or cross-layer responsibility
   boundaries.
   Input-normalization conventions may refine where a layer-owned pure helper is placed, but may not
   move protocol parsing out of adapters, scene input decisions out of usecases, or domain policy
   ownership out of core.

4. Type rules govern placement and reuse, not business ownership.
   `docs/common/type.rules.md` decides where types and enums live, but does not redefine adapter,
   usecase, queryservice, or module responsibilities.

5. Boundary contract rules govern naming and contract-vs-port terminology.
   `docs/common/boundary-contract.rules.md` decides `*.contract.ts` naming, rejects
   `*.port.ts` / `*.ports.ts` boundary files, and states that boundary contract is not a
   standalone layer.
   It does not override which layer owns a capability; ownership still follows the layer-boundary
   rules above.

6. Supplementary rules are additive by default.
   Files such as `docs/common/modules.extra.rules.md` add recommended practices unless they explicitly
   state that they override another rule.
   Supplementary rules do not override layer-boundary rules unless this precedence section explicitly
   says so.

7. When adapter, usecase, and queryservice concerns intersect, resolve precedence in this order:
   layer boundary -> scoped topic-specific rule -> repository-specific convention

## Rule Resolution Reporting

If `docs/common/rule-precedence.rules.md` is used to resolve an actual rule conflict, scope overlap, or ownership ambiguity, the output must explicitly report:

1. that `docs/common/rule-precedence.rules.md` was used;
2. which applicable documents were in conflict or overlap;
3. which precedence rule was applied;
4. the final resolution decision.

If this document was consulted but no actual conflict or overlap required resolution, no output is required
