<!-- 文件位置: docs/deprecated/ai-workflow-baseline-plan.md -->

# AI Workflow 基线补强计划

归档说明：本计划已完成。稳定实现规则以 `docs/common/ai-task-lifecycle-audit.rules.md`、
`docs/common/queue-identifiers.rules.md`、`docs/worker/qm-worker-integration.rules.md`、
`docs/worker/worker-adapter.rules.md` 和 `docs/worker/worker-usecase.rules.md` 为准。

## 目标

在基线仓库中补齐一套最小 AI Workflow 能力，使下游项目可以沿统一状态机、队列标识、worker
生命周期和 handler 扩展模式开发，而不是各自重新发明 workflow context。

本计划的核心取舍：

- 基线提供最小持久 workflow context、admission、worker 消费、handler registry 和轻量修复能力。
- 基线不并入 `backend_next` 的加密上下文、retention purge、demo GraphQL、中文示例 handler、ops
  查询面或真实供应商 smoke。
- 默认 payload 使用小型明文 JSON，仅用于非敏感通用任务；敏感场景由下游替换为加密或外部存储。

## 本地参考源

- `/var/www/backend_next` 是本计划的本机参考项目，可只读参考其中已完成的 AI workflow
  实现；迁入基线时必须按本计划裁剪，并适配当前仓库的命名、分层和 runtime contract。

## 适用规则

执行本计划前按需读取以下规则：

- `docs/common/modules.rules.md`
- `docs/common/usecase.rules.md`
- `docs/worker/worker-usecase.rules.md`
- `docs/worker/qm-worker-integration.rules.md`
- `docs/common/queue-identifiers.rules.md`
- `docs/common/ai-task-lifecycle-audit.rules.md`
- `docs/project-convention/ai-provider-call-persistence.rules.md`
- `docs/project-convention/database-baseline-delivery.rules.md`

若规则重叠，按 `docs/common/rule-precedence.rules.md` 处理。

## 不进入基线的内容

- 加密 payload codec、`SensitiveSnapshotCodecService`、密文 blob envelope。
- payload retention policy、purge 状态、自动清理加密内容。
- `example_text_rewrite`、`example_json_summary` 及其中文输入输出 schema。
- GraphQL demo resolver / DTO / query / mutation。
- workflow ops query、统计面板、运维查询 usecase。
- Qwen workflow live smoke。
- 默认常驻 housekeeping loop 和相关 config 开关。

## P0: Plan And Safety Gate

产出：

- 本计划文档落入 `plans/`。
- README 当前计划列表指向本文件。
- 确认工作区没有未解释的脏改动；若存在，先区分用户已有改动和本计划改动。

验收：

- 只改 `plans/` 文档，不改 `src/`、`test/`、migration 或 lockfile。

## P1: Workflow Context 最小状态账本

目标：

- 新增 `modules/ai-workflow-context`，作为 modules 层状态账本。
- 新增 baseline migration，遵守 entity 与 migration 同步维护。

设计：

- 表名使用单数：`ai_workflow_context`。
- 状态固定为：
  - `CREATED`
  - `ADMISSION_WAITING`
  - `QUEUED`
  - `PROCESSING`
  - `SUCCEEDED`
  - `FAILED`
  - `CANCELLED`
- 字段保留最小集合：
  - workflow identity：`workflowId`、`workflowType`
  - dedup：`workflowDedupHash`、`workflowDedupActiveHash`
  - queue linkage：`traceId`、`queueName`、`jobName`、`jobId`、`asyncTaskRecordId`
  - biz anchor：`bizType`、`bizKey`、`bizSubKey`
  - actor/source：`source`、`actorAccountId`、`actorActiveRole`
  - provider snapshot：`provider`、`model`
  - lifecycle：`status`、`admissionAttemptCount`、`nextEnqueueAt`、`admissionExpiresAt`、`admissionReason`
  - payload：`inputPayloadJson`、`outputPayloadJson`
  - failure：`errorCode`、`errorMessage`
  - timestamps
- dedup key 原文不落库，只落 SHA-256 hash。
- terminal 状态必须清空 `workflowDedupActiveHash`，释放 active dedup。
- service 对外只返回 view，不返回 ORM entity。

验收：

- context service 单测覆盖 create、existing active、状态迁移冲突、terminal 释放 active dedup。
- `npm run typecheck`。
- schema 改动后按项目条件执行或记录 `npm run migration:drill:empty-db` 结果。

实施记录：

- P1 已落 `src/modules/ai-workflow-context` 与 baseline migration。
- review 已吸收：
  - terminal context 查询必须包含 `CANCELLED`，与统一终态集合保持一致。
  - 对外 JSON payload 类型不允许根级 `null`，仅允许嵌套字段为 `null`；service 仍保留运行时防御。
- `src/**/*.spec.ts` 在测试运行时由 `tsconfig.spec.json` 提供 Jest 类型；若 IDE 将单个 spec
  挂到普通 `tsconfig.json` 项目下导致 `describe` / `jest` 无法识别，可在该 spec 顶部使用文件级
  `/// <reference types="jest" />`。不要为了修复 IDE 报错把 Jest globals 加进普通源码的全局
  TypeScript 配置。
- P1 已验证：
  - `npm run test:unit -- src/modules/ai-workflow-context/ai-workflow-context.service.spec.ts --runInBand`
  - `npm run typecheck`
  - `npx eslint src/modules/ai-workflow-context src/core/common/errors/domain-error.ts src/infrastructure/database/verify-empty-db-migrations.ts src/infrastructure/database/migrations/1775200800000-create-ai-workflow-context-table.migration.ts --max-warnings=0`
  - `npm run migration:drill:empty-db`

## P2: BullMQ / AI Queue Workflow Job

目标：

- 在现有 `ai` queue 中增加 workflow job，不新增独立 queue。
- 补齐 Producer 对显式 jobId、job 查询和队列健康检查的通用能力。

设计：

- `BULLMQ_JOBS.AI` 新增 `WORKFLOW: 'workflow'`。
- `ai-queue.runtime.ts` 新增 workflow job contract。
- workflow payload 只包含：
  - `workflowId: string`
  - `traceId: string`
- `BullMqProducerGateway` 新增：
  - `explicitJobId`
  - `hasJob()`
  - `checkQueueAvailable()`
- `explicitJobId` 与 `dedupKey` 互斥。
- generate/embed 的现有 dedup/trace 行为不变。
- `AiQueueService` 新增：
  - `enqueueWorkflow()`
  - `hasWorkflowJob()`
  - `checkWorkflowQueueAvailable()`

验收：

- Producer 单测覆盖 explicit jobId、互斥校验、has job、queue health。
- AiQueueService 单测覆盖 workflow payload 和 explicit jobId 映射。
- `npm run typecheck`。

实施记录：

- P2 已落 `BULLMQ_JOBS.AI.WORKFLOW` 与 AI workflow runtime contract。
- workflow BullMQ payload 固定为 `{ workflowId, traceId }`，不携带 input/output 业务 payload。
- `BullMqProducerGateway` 已支持 `explicitJobId`、`hasJob()`、`checkQueueAvailable()`；`explicitJobId`
  与 `dedupKey` 互斥，queue health 使用只读 `getJob('queue-health-probe')`。
- `AiQueueService` 已暴露 `enqueueWorkflow()`、`hasWorkflowJob()`、`checkWorkflowQueueAvailable()`；
  Redis / probe 异常映射为 `{ available: false, reason: 'QUEUE_UNAVAILABLE' }`，本地 queue
  未注册等 wiring 错误继续抛出。
- `explicitJobId` 是 AI workflow admission / housekeeping 的内部例外，已同步到
  `docs/common/queue-identifiers.rules.md`；不得从 adapter / 用户输入透传，也不适用于 generate / embed。
- P2 未接入 worker consume、admission usecase 或 async task record，这些仍归 P3/P4；P3 若先于 P4
  实现，不应暴露会真实入队 workflow job 的外部入口。
- P2 已验证：
  - `npm run test:unit -- src/infrastructure/bullmq src/modules/common/ai-queue --runInBand`
  - `npm run typecheck`
  - `npx tsc -p tsconfig.spec.json --noEmit --pretty false --noErrorTruncation`
  - `npx eslint src/infrastructure/bullmq src/modules/common/ai-queue --max-warnings=0`

## P3: Admission And Lightweight Housekeeping

目标：

- 新增 workflow 入队编排 usecase。
- 新增轻量修复 usecase，但不接常驻 loop。

设计：

- `CreateAndAdmitAiWorkflowUsecase`：
  - 创建或复用 active context。
  - 队列不可用时标记 `ADMISSION_WAITING`。
  - 队列可用时先标记 `QUEUED`，再用 explicit jobId 入队。
  - 入队成功后写 async task record，并回填 `asyncTaskRecordId`。
  - 入队后回填失败返回 `STALE_QUEUED` 风险结果。
- `RunAiWorkflowHousekeepingUsecase`：
  - 重试 due `ADMISSION_WAITING`。
  - 检查 stale `QUEUED` 的 BullMQ job 是否存在。
  - 若 job 存在且 async task 已回填，跳过。
  - 若 job 存在但 async task 缺失，补写 async task 并回填 `asyncTaskRecordId`。
  - 若 job 不存在且 admission 未过期，使用原 `jobId` 重新入队并补写 async task。
  - 若 job 不存在且 admission 已过期，标记 workflow `FAILED`，错误码使用 `ENQUEUE_REPAIR_TIMEOUT`。
  - 修复 terminal workflow 对应 async task 终态。
- 不引入 config factory、cron loop 或 worker loop。

验收：

- usecase 单测覆盖 queue unavailable、enqueue success、enqueue failed、existing active、housekeeping retry。
- async task 记录遵守 AI 生命周期审计规则。
- `npm run typecheck`。

实施记录：

- P3 已落 `src/usecases/ai-workflow`，包含 `CreateAndAdmitAiWorkflowUsecase`、
  `RunAiWorkflowHousekeepingUsecase` 与 `AiWorkflowUsecasesModule`；未接 GraphQL/API、cron
  loop 或 worker loop。
- admission 默认沿用 `/var/www/backend_next`：retry 30s、timeout 24h；housekeeping 默认 batch
  50、stale queued grace 60s，且不引入 config factory。
- async task biz domain 已补 `ai_workflow`，bizKey 仍按 AI 规则使用任务级 `traceId`；terminal
  reconcile 覆盖 `SUCCEEDED -> succeeded`、`FAILED -> failed`、`CANCELLED -> cancelled`。
- review 已吸收：
  - terminal reconcile 不覆盖已有但不同的终态 async task record，只记录 mismatch 并跳过。
  - stale queued repair 会验证已链接 `asyncTaskRecordId` 对应记录真实存在且匹配 queue/job/trace 后才跳过。
  - admission housekeeping 计数只把真实入队或终态修复记为 succeeded；继续等待记 skipped，
    `STALE_QUEUED` 记 failed。
- housekeeping 只做 due admission、stale queued repair 和 terminal async task reconcile；未并入 payload
  purge、retention 或加密上下文相关能力。
- P3 已验证：
  - `npm run test:unit -- src/usecases/ai-workflow --runInBand`
  - `npm run typecheck`
  - `npx tsc -p tsconfig.spec.json --noEmit --pretty false --noErrorTruncation`
  - `npx eslint src/usecases/ai-workflow src/modules/async-task-record src/core/common/async-task --max-warnings=0`

## P4: Worker Workflow 消费与 Handler Registry

目标：

- AI worker adapter 支持 `workflow` job。
- workflow 具体业务行为通过 handler 扩展。

设计：

- 新增 `AiWorkflowHandler` 接口、registry、`AiWorkflowNonRetryableError`。
- registry 使用 Nest provider discovery 收集带 `AiWorkflowHandlerProvider()` decorator 的 handler，
  避免硬编码 handler 列表。
- 新增 `ConsumeAiWorkflowJobUsecase`：
  - 校验 workflow context、jobId、traceId 匹配。
  - `SUCCEEDED` 幂等返回 accepted。
  - `FAILED` / `CANCELLED` 视为不可重试。
  - `QUEUED` 或超时 `PROCESSING` 可进入 `PROCESSING`。
  - 读取 input JSON，调用 handler，写 output JSON，标记 `SUCCEEDED`。
  - non-retryable error 标记 `FAILED`，避免 BullMQ 多次重试。
  - provider/transient error 保留 BullMQ retry。
- Worker mapper 不把 jobId 反推为正常 traceId；只允许降级 trace。
- 未知 AI job 继续落 `ai_worker` 降级失败记录。

验收：

- registry 和 non-retryable 单测。
- workflow consume usecase 单测覆盖成功、终态幂等、handler 缺失、non-retryable、transient retry。
- `npm run typecheck`。

实施记录：

- P4 已落 `src/usecases/ai-worker` workflow consume usecase、handler contract / registry 和
  non-retryable error；registry 通过 Nest `DiscoveryService` 收集带 `AiWorkflowHandlerProvider()` 的
  provider，默认可为空。
- AI worker adapter 已支持 `workflow` job 的 process / completed / failed lifecycle；process 中的
  workflow non-retryable error 会转换为 BullMQ `UnrecoverableError`，避免重复 retry。
- workflow worker 正常链路只从 payload 读取 `workflowId` / `traceId`；failed 事件才允许 degraded
  workflowId / traceId。
- worker usecase 统一写 workflow AsyncTaskRecord 和可选 generate provider-call record；handler 不直接写审计表。
- `CANCELLED` workflow 的 failed lifecycle 写入 `cancelled` AsyncTaskRecord，避免后续 terminal
  reconcile 产生终态 mismatch。
- review 已吸收：
  - handler registry 不使用伪 multi-provider token 数组，改为 `DiscoveryService` 发现带 decorator
    的 handler provider。
  - workflow queue/job 名称不再新增裸字符串真源，业务层 alias 从 BullMQ runtime constants 派生。
- P4 不包含默认业务 handler、GraphQL/API、常驻 loop、加密 payload、retention purge 或 ops 查询。
- P4 已验证：
  - `npx eslint src/usecases/ai-worker src/adapters/worker/ai src/modules/ai-workflow-context src/usecases/ai-workflow src/modules/common/ai-queue --max-warnings=0`
  - `npm run typecheck`
  - `npx tsc -p tsconfig.spec.json --noEmit --pretty false --noErrorTruncation`
  - `npm run test:unit -- src/usecases/ai-worker src/adapters/worker/ai --runInBand`
  - `npm run test:unit -- src/usecases/ai-workflow --runInBand`
  - `npm run test:unit -- src/modules/common/ai-queue --runInBand`

## P5: Generic Handler / E2E / Docs

目标：

- 提供一个可运行的通用 text generation workflow handler。
- 用 e2e 锁住基线 workflow 链路。
- 将稳定规则补入 docs。

设计：

- 新增 `generic_text_generate` handler。
- input JSON 约定：
  - `userPrompt: string`
  - `systemPrompt?: string`
  - `context?: string`
  - `provider?: AiProvider`
  - `model: string`
- output JSON 约定：
  - `outputText`
  - `provider`
  - `model`
  - `providerJobId`
  - `providerRequestId`
- `systemPrompt`、`context` 与 `userPrompt` 组装成单个 prompt 传给现有 generate provider。
- workflow context 中存在 provider / model 快照时，payload 中的 provider / model 必须与快照一致。
- 组装后的 prompt 复用现有 generate 入口的 12000 字符上限。
- 不添加 GraphQL workflow demo API。
- 不添加 text rewrite/json summary handler。
- 更新 worker docs，明确下游项目负责：
  - 敏感 payload 加密或外部存储
  - 业务 GraphQL/API 入口
  - 业务 handler
  - retention 与 ops 查询

验收：

- worker e2e 覆盖：
  - admission success -> `QUEUED`
  - consume success -> `SUCCEEDED` + output JSON
  - non-retryable -> `FAILED` 且不重复 provider call
  - transient retry success / final failure
  - admission waiting + housekeeping retry
- `npm run test:e2e:file -- worker 08-qm-worker/<workflow e2e 文件>`
- `npm run lint`
- `npm run typecheck`
- 必要时 `npm run build`

实施记录：

- P5 已落 `generic_text_generate` 默认 handler，并注册为带 `AiWorkflowHandlerProvider()` 的 worker
  usecase provider。
- handler 只依赖 `AiWorkerService.generate()`；不直接依赖 infrastructure/provider，也不直接写
  AsyncTaskRecord 或 ai_provider_call_record。
- input payload 缺失、类型错误、空白 `userPrompt` / `model` 会转换为
  `WORKFLOW_INPUT_PAYLOAD_INVALID` non-retryable 失败，不调用 provider。
- provider / model 快照不一致、组装后 prompt 超过 12000 字符同样归类为
  `WORKFLOW_INPUT_PAYLOAD_INVALID` non-retryable 失败。
- 新增 worker e2e 覆盖 admission success、consume success、non-retryable input、transient retry
  success / exhausted failure、admission waiting + housekeeping retry。
- P5 仍不包含 GraphQL/API demo、text rewrite/json summary handler、真实第三方 smoke、加密 payload、
  retention purge 或 ops 查询。
- P5 已验证：
  - `npm run test:unit -- src/usecases/ai-worker/generic-text-generate-workflow.handler.spec.ts --runInBand`
  - `npm run test:e2e:file -- worker 08-qm-worker/ai-workflow-generic-handler.e2e-spec.ts`

## 提交策略

- 按 P1 到 P5 分 5 个代码提交推进；P0 是文档提交。
- 每个 P 验证通过后再进入下一个 P。
- 不把依赖升级、格式化扫全仓或无关修复混入 workflow 提交。
- 若某个 P 发现既有测试失败，只修复与本 P 直接相关的问题。

## 默认决策

- 明文 JSON payload 最大字节数固定为 1 MiB，超限时抛稳定 `DomainError`。
- stale `QUEUED` 使用 P3 中定义的 repair 策略，不再在实现时重新选择。
- docs 中最终沉淀的位置预计为 worker queue integration 和 AI lifecycle audit 相关文档；P5 完成时再从本 plan 抽取稳定规则。
- workflow worker processing timeout 默认 15 分钟；P4 不新增配置模块。
