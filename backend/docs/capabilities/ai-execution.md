# AI Execution Capability Decision

## `ai.execution`

Owns queued generate and embed admission, provider selection and invocation, provider-call
observation, and the execution Worker lifecycle.

Workflow context, admission policy, workflow state, queue lifecycle, and housekeeping remain with
`ai.workflow`, even when a workflow invokes AI Execution. Individual provider implementations and
operation-level provider availability do not become child capabilities by default.

`runtime.async-task` is a hard prerequisite because accepted execution jobs and their Worker
lifecycle require durable asynchronous-task recording. The `ai` parent remains the product-level
availability switch and is an implicit prerequisite.

Disabled or blocked execution stops new admission and Worker activation. A disabled Worker must not
claim queued work.
