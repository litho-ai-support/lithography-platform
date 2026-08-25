<!-- docs/worker/worker-usecase.rules.md -->

Purpose: Define orchestration, write-side, and lifecycle guardrails for worker usecases.
Read when: You are implementing, reviewing, or refactoring worker usecase lifecycle orchestration.
Do not read when: Your task does not change worker usecase boundaries.
Source of truth: This file defines worker usecase rules; code examples elsewhere must not override it.
For precedence, see docs/common/rule-precedence.rules.md.

# Worker Usecase 说明

- 本规则聚焦 Worker 场景下的 Usecase 编排边界。
- 与通用 Usecase 规则互补使用。

## 目标与定位

- Worker Usecase 负责异步任务生命周期的业务编排与写语义落库。
- Worker Usecase 上游由 worker adapters 调用。
- 下游仅依赖 modules(service) 与 core。
- Worker Usecase 不感知 BullMQ `Job`、`Worker` 与原始 runtime event 对象。

## 输入契约

- 输入必须为显式 Command / Input / RuntimeContext。
- Worker Usecase 不接收 adapter DTO、queue runtime payload 或 BullMQ 类型；adapter 必须先完成
  协议到上述显式输入的映射。
- Command 表示一次显式业务意图；Input 表示 Usecase 稳定接收的字段集合；RuntimeContext 只表示
  attempts、timestamps、identifiers 等运行时技术上下文，不得替代业务参数。
- `Command` / `Input` / `RuntimeContext` 是 Usecase-owned framework-free contract，不以 adapter
  DTO、BullMQ Job 或 queue payload registry 作为类型真源。
- 不得透传 runtime 原始对象。
- 所需业务字段必须显式传参。
- 禁止在 Usecase 内反查 runtime 对象补齐字段。
- 对于缺省场景，允许接收由 Adapter 构造的“显式降级上下文”。

## 生命周期编排

- 建议按生命周期提供单一职责入口。
  例如 `process` / `complete` / `fail`。
- 每个入口只处理该生命周期的业务语义。
- 不在入口内扩展跨阶段编排。
- 若需要完整生命周期流转编排，应由独立 Flow Usecase 统一编排。
- Flow Usecase 对外暴露单入口。

## 降级上下文约定

- failed 事件出现 `job` 缺失时，Usecase 仍应可执行。
- 不得依赖 runtime 对象兜底。
- 降级上下文建议至少包含以下字段。
- `queueName`、`jobName`。
- 兜底 `jobId`、兜底 `traceId`。
- `occurredAt`、`reason`。
- 降级上下文中的标识字段应可检索、可关联，避免写入后不可追踪。

## 失败记录与可运营性

- Usecase 必须将降级失败输入写入可查询记录，状态应为可追溯的失败态。
- 失败记录应支持后续重试判断、人工决策与审计追踪。
- 不得仅依赖日志替代失败记录落库。

## 依赖与事务

- 依赖方向遵循 worker adapters → worker usecases → modules(service) / core。
- 禁止 worker usecases 直接依赖 infrastructure。
- 事务边界由 Usecase 定义。
- modules(service) 只提供细粒度方法。

## 禁止内容

- 在 Usecase 中拼装 Adapter 输出模型或承载协议层映射逻辑。
- 将 adapter DTO、BullMQ Job、queue payload contract 或 runtime event type 作为 Usecase 输入真源。
- 以获取某个 Service 为目的绕道依赖跨域 Usecase。
- 在 Usecase 中引入 BullMQ runtime 语义分支。
  例如按 Job 原始字段格式分支。
