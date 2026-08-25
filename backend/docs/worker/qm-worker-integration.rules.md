<!-- docs/worker/qm-worker-integration.rules.md -->

Purpose: Define end-to-end queue integration guardrails for QM worker additions.
Read when: You are implementing, reviewing, or refactoring new queue onboarding across API and worker.
Do not read when: Your task does not change QM worker integration boundaries.
Source of truth: This file defines QM worker integration rules; code examples elsewhere must not override it.

# QM Worker 接入规则

## 目标与适用范围

- 本文定义基于当前 QM Worker 基座新增队列时的统一接入规则。
- 本文覆盖 API 入队、Worker 消费、第三方调用、审计记录与测试落位。
- 本文用于统一命名、职责边界与可观测语义。
- 避免各业务线重复发明模式。
- 若与分层规则冲突，以 `adapters -> usecases -> modules(service) -> infrastructure` 依赖方向为最高优先级。

## 接入前置定义（编码前必须明确）

- 新增队列前必须先定义以下 6 个字段与语义。
  - `queueName`
  - `jobName`
  - `payload contract`
  - `bizType`
  - `dedupKey` 语义（复用旧任务 / 允许重新入队）
  - 成功 / 失败返回结构
- 若上述任一项未明确，不进入编码阶段。

## 强制规则

1. 先定领域边界，再落代码
   - 先完成任务标识、业务锚点、失败语义定义。
   - 再开始实现入队与消费逻辑。
2. 所有队列入口必须先过 Usecase
   - Resolver / Controller 仅做鉴权、校验、提取 actor。
   - 默认由 Usecase 负责编排入队、审计记录与失败回退。
   - 若某能力已收敛为 modules(service) 门面 + infrastructure 实现的一体化技术能力，可由 Usecase 仅调用该门面并处理业务补偿。
3. 所有入队必须具备 `traceId` 与可选 `dedupKey`
   - 未显式传入时由基础设施生成稳定标识。
   - 传入 `dedupKey` 时，必须先定义“命中复用”或“允许重入队”策略。
4. 所有队列必须写 Async Task Record
   - 至少覆盖 `enqueued`、`started`、`finished(succeeded/failed)` 三段状态。
   - 禁止出现只有 BullMQ Job、没有审计记录的链路。
5. Worker 失败必须归类
   - 禁止裸透传第三方异常。
   - 失败必须沉淀为稳定错误码或稳定前缀。
   - 支持重试、告警、统计复用。
6. Provider / 第三方调用必须在 Worker Service 或 Provider 层
   - Processor / Handler 仅做路由与映射。
   - 业务执行必须放在 Usecase / Provider。
7. 新队列必须具备 3 级测试
   - 入队 E2E。
   - Worker Consume E2E。
   - 涉及真实第三方时补受控 Live Smoke。
8. 公共行为优先复用现有模式
   - 不为单一业务重造命名。
   - 不重造审计与错误语义。
   - 需要例外时，必须先说明现有模式为何不适用。

## 分阶段接入约束

- 可以先注册 runtime job contract，再补 admission、审计和 worker consumer。
- contract 已注册但 worker consumer 未接入时，不得暴露会真实入队该 job 的 adapter / public usecase 入口。
- 内部门面若提前存在，只能服务后续阶段的 admission / housekeeping，不得绕过 Async Task Record。
- queue health / admission gate 只能把 Redis、BullMQ probe 或外部队列运行时异常映射为“队列不可用”。
- 本地注册、DI wiring、queueName / jobName 不合法等确定性配置错误必须继续抛出，不得进入等待或重试语义。
- admission / housekeeping 可在 worker consumer 接入前作为内部 usecase 存在，但不得接外部 adapter 或
  public usecase 入口。
- housekeeping 修复已链接 Async Task Record 时，应验证记录存在且与 queue/job/trace 匹配后才跳过；
  不得仅凭本地 linkage id 判定审计链路完整。
- housekeeping terminal reconcile 不得覆盖已有但不同的 Async Task Record 终态；这类 mismatch 应记录并跳过。
- workflow handler 应作为带 `AiWorkflowHandlerProvider()` decorator 的 Nest provider 注册，由 worker
  usecase registry 通过 provider discovery 收集；不得在 registry 内硬编码 handler 列表。
- workflow queue/job 名称以 BullMQ constants 为运行时真源；业务层需要复用时，通过 queue module 的
  常量 alias 引用，不得另起裸字符串真源。
- workflow worker consumer 可先于默认业务 handler 接入；当 registry 中没有匹配 handler 时，应作为
  non-retryable 失败处理并写入审计记录，不通过 BullMQ retry 等待 handler 后续上线。
- 对外 adapter / public usecase 暴露 workflow 入队前，必须确认目标 workflowType 已有 handler
  注册，或调用方明确接受 handler 缺失即任务失败的语义。
- workflow handler 不直接写 AsyncTaskRecord 或 ai_provider_call_record；worker usecase 统一收敛
  lifecycle 与 provider-call 审计写入。
- workflow handler 自己定义 prompt、provider input、provider output 解析和 output payload schema；通用
  worker 层不做业务语义翻译。
- handler 如果已经完成真实 provider 请求，但后续解析 provider output 或校验 output schema 失败，应通过
  non-retryable workflow error 携带 provider-call 结果，让 worker usecase 先写 provider-call 审计，再把
  workflow 标记为失败。
- 基线内置的 `generic_text_generate` 只提供通用文本生成 workflow handler：
  - input payload 固定为 `userPrompt`、可选 `systemPrompt` / `context` / `provider`、必填 `model`。
  - workflow context 中存在 provider / model 快照时，payload 中的 provider / model 必须与快照一致。
  - `systemPrompt`、`context` 与 `userPrompt` 组装后传给现有 generate provider。
  - 组装后的 prompt 复用现有 generate 入口的 12000 字符上限。
  - 非法 input、快照不一致或 prompt 超限属于 non-retryable workflow 失败，不调用 provider。
- 下游项目仍负责业务 GraphQL/API 入口、业务 handler、示例 / demo handler、敏感 payload 加密或外部存储、
  retention、ops 查询与 workflow 真实第三方 smoke；这些不属于基线默认能力。

## 落位规范

- 入口层（Resolver / Controller）
  - 目录：`src/adapters/api/graphql/...` 或 `src/adapters/api/http/...`
  - 参考：`src/adapters/api/graphql/ai/ai.resolver.ts`
- 入队 Usecase
  - 目录：`src/usecases/<queue-domain>/`
  - 参考：`src/usecases/ai-queue/queue-ai.usecase.ts`
- 队列服务
  - 目录：`src/modules/common/<queue-domain>/`
  - 参考：`src/modules/common/ai-queue/ai-queue.service.ts`
- Worker Consume Usecase
  - 目录：`src/usecases/<worker-domain>/`
  - 参考：`src/usecases/ai-worker/consume-ai-job.usecase.ts`
- Processor / Handler / Mapper
  - 目录：`src/adapters/worker/<domain>/`
  - 参考：`src/adapters/worker/ai/ai-job.processor.ts`
- Provider Registry / Third-party Client
  - Registry 目录：`src/modules/common/<worker-domain>/providers/`
  - Third-party Client 目录：`src/infrastructure/ai/providers/`
  - 参考：`src/modules/common/ai-worker/providers/ai-provider-registry.ts`
  - 参考：`src/infrastructure/ai/providers/qwen/qwen-generate.provider.ts`
- BullMQ 注册与 Runtime Contract
  - 目录：基础设施注册层
  - 这里的 Contract 是 BullMQ runtime contract，只描述队列传输 payload / result / validator。
    它不是 layer boundary contract，也不是上层业务类型的真源。
  - 参考：`src/infrastructure/bullmq/bullmq.constants.ts`
  - 参考：`src/infrastructure/bullmq/contracts/job-contract.registry.ts`
  - 参考：`src/infrastructure/bullmq/queue-registry.ts`
  - Runtime contract 文件使用 `*.runtime.ts`、`*.payload.ts` 或 `*.registry.ts`，不得使用
    layer boundary contract 的 `*.contract.ts` 后缀。
  - Worker Adapter 不导入这些 infrastructure 文件；它保留 adapter-local payload 视图并映射到
    Usecase 输入。注册真源、适配视图和行为由 topology validation 与测试对账。
- 审计记录
  - 统一走 Async Task Record Service，不单独造表。
  - 参考：`src/usecases/ai-queue/queue-ai.usecase.ts`
  - 参考：`src/usecases/ai-worker/consume-ai-job.usecase.ts`

## 模块装配规范

- API 入口模块放在 Adapter Module。
- Worker 消费模块放在 Worker Adapter Module。
- 公共能力放在 Common Module / Usecases Module。
- 参考：
  - `src/adapters/worker/ai/ai-worker-adapter.module.ts`
  - `src/bootstraps/worker/worker.module.ts`

## 测试落位规范

- 普通 E2E：`test/08-qm-worker/`
- 真实第三方 Smoke：`test/99-third-party-live-smoke/`
- 参考：
  - `test/08-qm-worker/ai-graphql-queue.e2e-spec.ts`
  - `test/08-qm-worker/ai-workflow-generic-handler.e2e-spec.ts`
  - `test/99-third-party-live-smoke/ai-qwen-generate-real.e2e-spec.ts`

## 新增一个队列的最短清单

1. 增加 `queueName` / `jobName` 常量与 `payload contract`。
2. 增加 Queue Service 与 Enqueue Usecase。
3. 增加 API 入口。
4. 增加 Worker Consume Usecase。
5. 增加 Processor / Handler / Mapper。
6. 接入 Provider 或内部执行器。
7. 接入 Async Task Record 三段状态。
8. 补齐入队 E2E、消费 E2E，必要时补 Live Smoke。
