# Current Capability Decisions

Horizontal layers still decide technical responsibility. These decisions identify the product or
operational function a change belongs to and the explicit behavior gate a human reviewer can follow.

## `ai`

Owns product-level availability for the framework's AI functions. It is a real parent switch, not a
namespace-only grouping. Execution and Workflow retain their own queues and lifecycle.

## `ai.execution`

Owns queued AI execution and its Worker lifecycle. See the dedicated
[AI Execution decision](ai-execution.md).

## `ai.workflow`

Owns workflow context, admission, state, queue lifecycle, and housekeeping. See the dedicated
[AI Workflow decision](ai-workflow.md).

## `identity.account`

Owns account identity, profile, credential, access facts, and account-registration completion
semantics. Authentication/session issuance, verification records, and external-account binding remain
outside this boundary.

## `identity.authentication`

Owns authentication, token/session issuance, and current-user projection. Account persistence and
external-account binding remain with their owning capabilities.

## `identity.external-account`

Owns local external-account binding facts together with provider identity exchange used by those
flows. It does not own account registration policy or authentication/session issuance.

## `identity.verification`

Owns verification challenge creation, lookup, consumption, revocation, and their persisted facts.
The business outcome requesting verification remains with the requesting flow.

## `runtime.async-task`

Owns cross-runtime asynchronous task state, trace, attempts, and audit history. It does not own AI
workflow state or individual provider request/response facts.

## `runtime.email-delivery`

Owns operated email admission, delivery, and Worker lifecycle. See the dedicated
[Email Delivery decision](runtime-email-delivery.md).
