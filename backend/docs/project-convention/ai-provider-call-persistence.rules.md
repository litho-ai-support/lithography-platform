<!-- docs/project-convention/ai-provider-call-persistence.rules.md -->

Purpose: Define persistence semantics and write boundaries for ai_provider_call_record.
Read when: You are implementing, reviewing, or refactoring AI provider call record writes or fields.
Do not read when: Your task does not change provider-call record boundaries.
Source of truth: This file defines provider-call record rules; code examples elsewhere must not override it.

# AI Provider 调用落库规则

## 目标

- 本文定义 `ai_provider_call_record` 的主语义、字段职责、写入边界与上游责任。
- 本文用于约束 AI provider 调用级落库。
- 避免和 `AsyncTaskRecord`、聚合统计、内容审计混用。
- 本文优先服务当前 AI queue / worker 链路。
- 也允许未来非队列直调场景复用。

## 表定位

- `ai_provider_call_record` 一行只表达一次真实的 provider 调用结果。
- 本表是 provider 调用记录表，不是任务生命周期表。
- 本表不是聚合统计表。
- 不承担日报、按模型汇总、按账号汇总等预聚合职责。
- 本表不是内容审计表。
- 不承载 prompt、text、metadata、outputText、vector 等内容字段。

## 表名治理说明

- 当前物理表名是单数名 `ai_provider_call_record`。
- 数据库表名统一使用单数，详见
  [database-baseline-delivery.rules.md](./database-baseline-delivery.rules.md)。
- 本表不得恢复为复数表名。

## 与 `AsyncTaskRecord` 的边界

- `AsyncTaskRecord` 记录异步任务生命周期。
- 包括入队、处理中、完成、失败、重试次数、任务级时间点。
- `ai_provider_call_record` 记录 provider 调用级事实。
- 包括调用了谁、用了什么模型、是否成功、token/cost/错误码、provider 开始/结束时间。
- 一个异步任务可以没有 provider 调用记录：
  - 入队失败
  - worker 还未真正调用 provider
  - 在 provider 调用前已被拦截或短路
- 一个异步任务也可以有多条 provider 调用记录：
  - worker 重试
  - 一个任务内部存在多次真实 provider 调用
  - 未来链路出现串行多步 AI 编排

## 一行记录的判断标准

- 只有发生了一次真实 provider 请求尝试，才允许写一条 `ai_provider_call_record`。
- 只做任务入队、命中已有任务、worker 生命周期推进，不构成 provider 调用记录。
- 同一次 provider 调用最终只应对应一行记录。
- 若需要分阶段写入，必须由上游持有稳定记录锚点并更新同一行。
- 不得依赖“重复插入后再碰运气去重”。

## 字段职责

### 标识与关联字段

- `id`：表内主键，仅负责本表唯一性。
- `async_task_record_id`：逻辑关联到 `base_async_task_record.id`，允许为空以支持非队列直调。
- `trace_id`：任务级 / 调用链级追踪 ID。
- 用于把同一条 AI 链路中的任务记录、provider 调用、失败排查关联起来。
- `trace_id` 不是 HTTP `requestId`。
- `trace_id` 不是幂等键。
- `trace_id` 不是 provider 调用记录唯一键。
- `call_seq`：同一 `trace_id` 下的调用序号，用于排序与展示。
- `call_seq` 必须由上游程序负责分配。
- `call_seq` 当前约定为正整数，从 `1` 开始。
- `(trace_id, call_seq)` 使用唯一约束兜底。
- 用于防止并发写入产生重复序号。
- 上游写入入口必须在冲突时重新分配 `call_seq` 并重试写入。
- 不得把唯一冲突直接暴露为最终业务失败。
- 若未来出现同一 `trace_id` 下并发子流程，应先补充 branch / scope 语义字段。
- 再调整唯一约束维度。

### actor 与业务锚点字段

- `account_id`：发起账号 ID 快照，可空。
- `nickname_snapshot`：发起时昵称快照，可空。
- `biz_type` / `biz_key` / `biz_sub_key`：真实业务对象锚点。
- 本表中的 `biz_*` 表示真实业务对象。
- 不表示任务级 `trace_id`。
- 禁止在本表把 `biz_key` 偷换成“为了方便查询而再存一份 `trace_id`”。

### 调用快照字段

- `source`：触发来源快照，非空。
- `provider`：AI 提供商标识，如 `openai`、`qwen`。
- `model`：调用使用的模型标识。
- `task_type`：调用类型，如 `generate`、`embed`、`rerank`、`classify`。
- `provider_request_id`：provider 返回的请求 ID / 响应 ID / job ID。
- 没有则为空。
- `provider_status`：本次 provider 调用结果。
- 仅表达调用本身是 `succeeded` 还是 `failed`。

### 消耗与错误字段

- `prompt_tokens`：输入 token 数；未知时为 `NULL`。
- `completion_tokens`：输出 token 数；未知时为 `NULL`。
- `total_tokens`：总 token 数；未知时为 `NULL`。
- `cost_amount`：消费金额；未知时为 `NULL`。
- `cost_currency`：币种；未知时为 `NULL`。
- `normalized_error_code`：系统内部归一化错误码。
- `provider_error_code`：上游 provider 原始错误码。
- `error_message`：错误摘要。
- 用于排障检索，不追求完整原文。

### 时间字段

- `provider_started_at`：调用 provider 开始时间。
- `provider_finished_at`：调用 provider 结束时间。
- `provider_latency_ms`：调用耗时毫秒数。
- `created_at` / `updated_at`：本表行的创建与更新时间。

## 时间语义规则

- `provider_started_at`、`provider_finished_at`、`created_at`、`updated_at` 都属于系统事件时间。
- 这些字段在数据库中统一使用 `TIMESTAMP(3)`。
- `provider_latency_ms` 是时长，不是时间点。
- 禁止把业务日期时间写入上述字段。
- 禁止在通用层根据字段名自动猜测时间语义。

## 上游程序负责的约束

- 本表当前明确采用“数据库尽量少做推导和强约束”的策略。
- 以下正确性由上游单一写入入口负责保证：
  - `call_seq >= 1`
  - 发生 `(trace_id, call_seq)` 唯一冲突时，必须重新分配并重试
  - `total_tokens = prompt_tokens + completion_tokens`
  - 当 `prompt_tokens` 或 `completion_tokens` 未知时，`total_tokens = NULL`
  - `provider_latency_ms = provider_finished_at - provider_started_at`
  - 当开始或结束时间未知时，`provider_latency_ms = NULL`
  - `provider_status = 'succeeded'` 时，错误字段原则上应为空
  - `provider_status = 'failed'` 时，至少应尽量补齐 `normalized_error_code` 或 `error_message`
- 这些规则应集中在单一 usecase / mapper / writer 中收敛。
- 禁止把同一套字段计算逻辑散落在多个 provider adapter 中各自实现。

## 空值规则

- 未知不等于 `0`。
- 未知不等于空字符串。
- token、cost、provider request id、error code、error message、provider 时间字段在未知时统一写 `NULL`。
- 只有字段值真实可确定时，才允许写入非空值。

## 写入时机建议

- 默认建议在一次 provider 调用结束后写入完整记录。
- 如果业务需要观测“调用中”状态，允许先写入开始态，再在调用结束后更新同一行。
- 不论采用单次写入还是分阶段写入，都必须保证“同一次真实 provider 调用最终只占一行”。

## 重试与多次调用规则

- worker 的每一次真实 provider 调用尝试，都应落为独立记录。
- 同一个异步任务重试三次，若三次都真的打到了 provider，则应有三条记录。
- 一次任务内若先调用 embedding、再调用 rerank，属于两次真实 provider 调用。
- 应写两条记录。
- 不得把多次真实 provider 调用压扁成一条记录。
- 也不得把一次 provider 调用拆成多条最终记录。

## AI workflow 调用规则

- AI workflow 的 `base_async_task_record.biz_type` 固定表达队列任务域，例如 `ai_workflow`；它的
  `biz_key` 仍按任务级 `traceId` 规则写入。
- AI workflow 写 `ai_provider_call_record` 时，`biz_type` / `biz_key` / `biz_sub_key` 必须沿用
  workflow context 中的真实业务对象锚点，不得沿用 async task 的 `ai_workflow + traceId` 任务锚点。
- `task_type` 表示 provider 调用类型，例如 `generate`、`embed`、`rerank`，不是 `workflowType`。
- provider 已真实返回成功，但 handler 在 output 解析、schema 校验或后置业务规则中判定 workflow 不可重试失败时，
  仍应记录一条 `provider_status = 'succeeded'` 的 provider-call 事实；workflow 终态可以是 `FAILED`。
- 发生真实 provider API 请求且请求失败时，才记录 `provider_status = 'failed'` 的 provider-call。
  provider 配置缺失、provider 不支持、本地路由 / 配置层判定的 model 不支持、
  workflow input/schema/contract 错误等未发生真实 provider 请求的问题，默认不写 provider-call 记录。

## 非队列直调规则

- 非队列直调允许 `async_task_record_id = NULL`。
- 即使没有异步任务记录，也应尽量保持 `trace_id`、`source`、`provider`、`model`、`task_type` 等字段完整。
- 非队列直调不改变本表“一行表示一次真实 provider 调用”的主语义。

## 明确不做的事

- 不把本表升级成 prompt / output 内容审计表。
- 不把本表升级成任务生命周期表。
- 不把本表升级成聚合统计表。
- 不依赖数据库 `generated column` 计算 `total_tokens`。
- 不依赖数据库 `CHECK` 约束保证 `call_seq`、token 和时长的正确性。
- 不依赖数据库外键约束绑定 `AsyncTaskRecord` 生命周期。
- 不把 `trace_id` 当作强唯一命名空间使用。

## 推荐查询锚点

- 按 `trace_id` 查询一条 AI 链路下的 provider 调用记录。
- 按 `async_task_record_id` 查询某个任务对应的 provider 调用记录。
- 按 `provider + model + created_at` 做运营统计切片。
- 按 `provider_status`、`normalized_error_code`、`provider_error_code` 做失败排查。
- 按 `biz_type + biz_key + biz_sub_key` 回查真实业务对象相关调用。

## 与其他文档的关系

- 本文是 [queue-identifiers.rules.md](../common/queue-identifiers.rules.md) 在 provider 调用落库场景下的补充。
- 本文与 [ai-task-lifecycle-audit.rules.md](../common/ai-task-lifecycle-audit.rules.md) 配套使用：
  - 前者定义任务生命周期审计
  - 本文定义 provider 调用记录
- 时间字段语义继续遵循：
  - [time-field-design.md](../project-convention/time-field-design.md)
  - [time-normalize-v1-boundaries.md](../project-convention/time-normalize-v1-boundaries.md)

## 一句总原则

- `AsyncTaskRecord` 记“任务发生了什么”，`ai_provider_call_record` 记“provider 调用了什么且结果如何”，字段正确性由上游单一写入入口负责收敛，不靠数据库推导或碰巧约束。
