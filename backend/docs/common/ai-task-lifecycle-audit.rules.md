<!-- docs/common/ai-task-lifecycle-audit.rules.md -->

Purpose: Define audit semantics and write guardrails for AI task lifecycle records.
Read when: You are implementing, reviewing, or refactoring AI enqueue/worker lifecycle status updates.
Do not read when: Your task does not change AI lifecycle audit boundaries.
Source of truth: This file defines AI lifecycle audit rules; code examples elsewhere must not override it.

# AI 任务生命周期审计补充规则

## 目标

- 本文仅定义 AI 任务生命周期审计，不定义请求内容审计。
- 本文用于串联 AI GraphQL 入队、AI Queue Usecase、AI Worker Adapter、AI Worker Usecase、AsyncTaskRecord 写入语义。
- 本文不改数据库结构。
- 仅约束字段写入与语义一致性。

## 明确范围

- 只做任务生命周期审计：
  - 是否成功入队
  - 是否命中已有任务
  - worker 是否开始 / 完成 / 失败 / 取消
  - 失败原因、发生时间、重试次数、最终失败尝试
  - 正常任务与降级任务区分
- 明确不做：
  - 不写入 prompt、text、metadata、outputText、vector
  - 不将 AsyncTaskRecord 升级为 AI 内容审计表
  - 不改 email
  - 不先改共享 producer，除非 AI 独占需求明确触发

## 本轮审计字段

- 标识字段：queueName、jobName、jobId、traceId、dedupKey
- actor 字段：actorAccountId、actorActiveRole
- 业务锚点：bizType、bizKey
- 生命周期字段：status、attemptCount、maxAttempts
- 时间字段：occurredAt、enqueuedAt、startedAt、finishedAt
- 审计说明字段：source、reason

## 固定语义规则

- AI 统一 bizKey = traceId。
- jobId 只负责队列任务唯一性，不承担链路语义。
- traceId 只负责链路关联，不承担幂等判定。
- dedupKey 只负责幂等，不承担追踪语义。
- AsyncTaskRecord 仍以 (queueName, jobId) 作为更新锚点。
- AI 正常链路 source：
  - API 入队写 user_action
  - Worker 生命周期写 system
  - workflow admission 写入沿用 workflow context source
- AI worker 生命周期更新已有 API queued 记录时，应把该生命周期事件的 `source` 写为 `system`，
  并写入来自 BullMQ job 配置的 `maxAttempts`。
  这是 AI 审计规则的显式语义，不自动改变 email 等其他队列的既有记录更新行为。
- actor 边界语义：
  - actor 只在 API 入队侧写入。
  - 入队成功与入队失败路径都适用。
  - Worker 生命周期事件不覆盖 actor。
  - 重复命中已有任务时不重写 actor。
  - 沿用已有记录。
- reason 必须是可检索、可读的稳定语义。
- 不依赖日志上下文。

## AI 任务类型

- generate：bizType = ai_generation
- embed：bizType = ai_embedding
- workflow：bizType = ai_workflow
- 降级 worker 记录：bizType = ai_worker

## 入库映射矩阵

| 场景 | status | source | reason | bizType | bizKey |
|---|---|---|---|---|---|
| 入队成功 | queued | user_action | enqueue_accepted | ai_generation / ai_embedding | traceId |
| 入队失败 | failed | user_action | enqueue_failed:<summary> | ai_generation / ai_embedding | traceId |
| worker 开始处理 | processing | system | worker_processing | ai_generation / ai_embedding | traceId |
| worker 完成 | succeeded | system | worker_completed | ai_generation / ai_embedding | traceId |
| worker 失败 | failed | system | worker_failed:<summary> | ai_generation / ai_embedding | traceId |
| workflow admission accepted | queued | context source | enqueue_accepted | ai_workflow | traceId |
| workflow worker 开始处理 | processing | system | worker_processing | ai_workflow | traceId |
| workflow worker 完成 | succeeded | system | worker_completed | ai_workflow | traceId |
| workflow worker 失败 | failed | system | worker_failed:<summary> | ai_workflow | traceId |
| workflow worker 取消 | cancelled | system | worker_cancelled:<summary> | ai_workflow | traceId |
| workflow terminal reconcile succeeded | succeeded | system | worker_completed | ai_workflow | traceId |
| workflow terminal reconcile failed | failed | system | worker_failed:workflow_reconciled | ai_workflow | traceId |
| workflow terminal reconcile cancelled | cancelled | system | worker_cancelled:workflow_reconciled | ai_workflow | traceId |
| payload 缺失 traceId 降级 | failed | system | 含 missing_payload_trace_id | 原 job 对应 bizType | 降级 traceId |
| failed 事件缺失 job | failed | system | worker_event_job_missing:* | ai_worker | fallback traceId |
| failed 事件未知 jobName | failed | system | unsupported_ai_job:* | ai_worker | 该任务 traceId |

### 重复命中已有任务规则

- 重复命中不是新的写库事件。
- 仅返回已有任务真实 jobId / traceId。
- 记录字段全部沿用已有记录。
- 不新增记录。
- 不重写已有 status / reason / source / actorAccountId / actorActiveRole / occurredAt / enqueuedAt / startedAt / finishedAt。

## 时间字段规则

- occurredAt：当前事件发生时间。
- enqueuedAt：任务被系统接受入队时间。
- startedAt：worker 开始处理时间。
- finishedAt：worker 完成、失败或取消时间。
- 重复入队命中规则以“重复命中已有任务规则”章节为准。

## attempt 规则

- queued：attemptCount = 0
- processing：attemptCount = attemptsMade + 1
- succeeded / failed / cancelled：attemptCount = 最终执行次数。
- maxAttempts：取 BullMQ job 配置值。

## Workflow housekeeping 修复规则

- workflow admission / housekeeping 的 bizType 固定为 `ai_workflow`，bizKey 固定为任务级 `traceId`。
- stale queued repair 只有在已链接的 `asyncTaskRecordId` 对应记录真实存在，且 queueName、jobName、jobId、
  traceId 与 workflow context 匹配时，才可视为已修复并跳过。
- 已链接 async task record 缺失或标识不匹配时，应继续按缺失审计记录修复，补写或回填 AsyncTaskRecord。
- terminal reconcile 只修复缺失或非终态 AsyncTaskRecord。
- terminal reconcile 不得把已有终态 AsyncTaskRecord 覆盖成另一个终态；遇到 workflow 终态与 async task
  终态不一致时，记录 mismatch 并跳过，由后续人工或专项修复处理。

## Workflow worker 消费规则

- workflow worker payload 只承载 `workflowId` 与 `traceId`；input/output 业务 payload 从
  `ai_workflow_context` 读取和写回。
- workflow worker queue/job 名称以 BullMQ runtime constants 为真源；审计记录只写入该真源派生出的
  queue/job 名称。
- workflow worker process 必须校验 context、`jobId` 与 `traceId` 匹配；正常链路不得从 `jobId`
  反推 `traceId`。
- `SUCCEEDED` workflow 可幂等接受；`FAILED` / `CANCELLED` workflow 视为不可重试终态。
- handler 缺失、payload 缺失、context/job mismatch 属于 non-retryable worker 失败，不消耗 BullMQ
  重试来等待代码变化。
- `generic_text_generate` 等 workflow handler 只返回 output payload 与可选 provider-call 结果；
  handler 不直接写 AsyncTaskRecord 或 ai_provider_call_record。
- workflow usecase 统一负责 provider-call 审计写入；input 校验失败等 non-retryable 错误不得产生
  provider-call 记录。
- 如果 handler 已经完成真实 provider 请求，但在解析 provider output、校验输出 schema 或后置业务规则时判定
  workflow 不可重试失败，handler 可通过 `AiWorkflowNonRetryableError` 携带 provider-call 结果；
  workflow usecase 必须先记录这次 provider-call 事实，再把 workflow 标记为 `FAILED`。
- provider-call 审计描述的是真实 provider 请求事实，不描述 workflow 最终业务状态；同一次 workflow 可以出现
  provider-call `succeeded` 但 workflow `FAILED`。
- provider 配置缺失、provider 不支持、本地路由 / 配置层判定的 model 不支持、input schema 错误、
  handler contract 错误等未发生真实 provider 请求的问题，默认不产生 provider-call 记录；除非 handler
  明确携带已发生的 provider-call 结果。
- transient/provider 失败保留 BullMQ retry；非最终 attempt 应释放 workflow 回 `QUEUED`，最终
  attempt 标记 workflow `FAILED`。
- 若 workflow 已是 `CANCELLED`，failed 事件写入 `cancelled` AsyncTaskRecord，不得再把该 job 的
  lifecycle 审计覆盖成 `failed`。

## 降级规则

- 仅允许以下三类降级：
  - enqueue-failed
  - worker failed 事件缺失 job
  - worker 遇到 payload 缺失 traceId、未知 jobName 或上下文字段损坏
- 降级生成的 jobId / traceId 必须可检索、可区分。
- 降级记录不能反向定义正常链路语义。

## reason 稳定性约束

- reason 采用“稳定前缀 + 可读摘要”格式。
- 摘要允许截断。
- 统一规则：
  - 入队失败：enqueue_failed:<summary>
  - worker 普通失败：worker_failed:<summary>
- 其余稳定语义：
  - enqueue_accepted
  - worker_processing
  - worker_completed
  - worker_cancelled:workflow_reconciled
  - worker_cancelled:*
  - missing_payload_trace_id
  - missing_payload_workflow_id
  - worker_event_job_missing:*
  - unsupported_ai_job:*

## 与现有标识规则文档关系

- 本文是 [queue-identifiers.rules.md](queue-identifiers.rules.md) 在 AI 生命周期审计上的补充。
- 当两文档存在冲突时，以“字段职责单一、幂等与追踪分离、降级不反定义正常语义”为最高优先级。
