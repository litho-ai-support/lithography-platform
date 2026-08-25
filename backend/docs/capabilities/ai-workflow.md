# AI Workflow Capability Decision

## `ai.workflow`

Owns workflow context, admission policy, execution state, queue lifecycle, and housekeeping.

Provider selection, provider invocation, generate and embed execution, and provider-call observation
remain with `ai.execution`. Invoking AI Execution does not transfer those facts into Workflow.

`ai.execution` is a hard prerequisite. The `ai` parent is an implicit prerequisite, and durable Async
Task availability is inherited through AI Execution rather than repeated in `requires`.

When Workflow is blocked only by `ai.execution`, terminal reconciliation may drain from facts already
owned by Workflow without making a new execution call. Explicitly disabling Workflow, disabling the
`ai` parent, or losing durable Async Task availability does not permit that drain path.
