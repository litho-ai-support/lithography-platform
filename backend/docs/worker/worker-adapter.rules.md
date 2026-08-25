<!-- docs/worker/worker-adapter.rules.md -->

Purpose: Define runtime adaptation guardrails for worker adapters.
Read when: You are implementing, reviewing, or refactoring worker processors and lifecycle event handlers.
Do not read when: Your task does not change worker adapter runtime boundaries.
Source of truth: This file defines worker adapter rules; code examples elsewhere must not override it.

# Worker Adapter 说明

- 本规则处于试行阶段。
- 允许提出修改意见。
- 新增队列时先遵循 `docs/worker/qm-worker-integration.rules.md` 的接入总规则。
- 再阅读本文 Adapter 细则。

## 定位与职责

- Worker Adapter 是异步任务入口适配层，负责消费队列运行时事件并调用对应 Usecase。
- Worker Adapter 只做协议 / 运行时适配。
- Job -> 内部显式输入模型。
- Usecase 结果 -> 运行时返回。
- Worker Adapter 不承载业务规则。
- Worker Adapter 不承载跨域编排、权限判断与事务语义。
- Worker Adapter 可以响应运行时生命周期事件。
  例如 process / completed / failed / stalled。
- 生命周期响应仅限转换为对应的内部调用。
- 不得在 Adapter 内扩展为业务流程编排。

## 允许内容

- BullMQ Processor、Worker 事件监听（completed / failed / stalled 等）。
- Job 元数据解析与 RuntimeContext 映射（jobId、traceId、attempts、timestamp）。
- 运行时参数适配（并发、限流、重试、退避相关的技术参数读取）。
- 技术性日志与监控埋点。
- 不包含业务决策。
- 不得写入业务状态。
- 将队列框架原始对象转换为 adapter-local runtime payload，再映射为 Usecase 所需的显式
  Command / Input / RuntimeContext。
- 基于运行时生命周期事件，调用单个对应职责的 Usecase 入口。

## 禁止内容

- 直接依赖 modules(service) 或 infrastructure 的业务实现。
- 在 Adapter 内实现业务规则、权限判断、事务边界控制。
- 在 Adapter 内实现跨域编排。
- 在 Adapter 内实现补偿编排。
- 在 Adapter 内实现基于业务结果的条件分支流程。
- 直接写数据库、发业务事件、调用外部系统。
  队列运行时本身除外。
- 以“为了拿某个 service”为目的绕过 Usecase。
- 返回 ORM Entity 或暴露底层查询对象。
- 将 BullMQ `Job`、`Worker`、原始运行时事件对象直接传入 Usecase。
- 将队列框架字段结构作为 Usecase 的隐式输入契约。
- 在 Adapter 内为了“顺手处理”而追加额外副作用。

## 依赖方向

- 允许：worker-adapters -> usecases。
- 允许 worker-adapters -> adapters-common。
  例如通用装饰器、schema 工具、mapper 工具。
- 允许 worker-adapters -> adapter-local runtime payload definitions。
  仅限队列协议适配；跨入 Usecase 的类型必须是显式 Command / Input / RuntimeContext，不能以
  adapter DTO、BullMQ Job 或 queue payload 作为业务输入真源。
- Worker Adapter 不得从 infrastructure 导入 queue 常量或 runtime contract；适配层在本地声明协议视图，
  由 topology validation 与行为测试和 infrastructure 注册真源对账。
- 禁止 worker-adapters -> modules(service) / infrastructure。
  尤其是业务语义相关依赖。
- 禁止：任意层反向依赖 worker-adapters。
- 禁止 usecases 反向依赖 BullMQ runtime 对象。
- 禁止 usecases 要求 adapter 透传原始 Job 结构。

## 设计原则

- 输入输出最小化。
  仅做运行时与业务参数边界转换。
- 显式输入优先。
  Usecase 所需字段必须显式传参。
- 不依赖运行时对象反查字段。
- 框架细节止于 Adapter。
  BullMQ 的 `Job` / `Worker` / event payload 不进入 Usecase。
- 失败可观测。
  失败事件必须携带可追踪上下文。
  包括 queueName、jobName、jobId、traceId。
- 技术策略前置。
  重试、退避、并发属于运行时策略。
- 不把运行时策略带入 Usecase 业务语义。
- 幂等优先。
  同一 job 重试场景下，Adapter 不引入额外副作用。
- 生命周期响应有限。
  Adapter 可以响应 process / completed / failed 等生命周期。
- 不得借此扩展为业务编排层。

## 术语约定（最小）

- Adapter-local runtime payload：只描述队列协议在 adapter 内的结构，不向 usecase 传播。
- Command：表示一次显式业务意图输入，供 Usecase 执行。
- Input：表示 Usecase 显式接收的稳定输入，但不隐含业务意图名称。
- RuntimeContext：表示运行时技术上下文。
  例如 attempts、timestamps、identifiers。
- RuntimeContext 不得替代业务参数。
- Handler 输入建议使用 `Command + RuntimeContext`。
- 或使用已归一化的单一输入对象。
- 避免在协作处混用未约定术语。

## 结构与命名

- 目录：`src/adapters/worker/<bounded-context>/`
- 推荐子结构：
  - `*.processor.ts`：WorkerHost + 队列事件绑定。
  - `*.handler.ts`：标准化 runtime context 到单个 Usecase 输入的映射与调用。
  - `*.mapper.ts`：Job / event -> adapter-local runtime payload / RuntimeContext 的字段转换。
  - `*.adapter.module.ts`：仅声明 adapter provider 与 usecase imports。
- 命名建议：
  - `<domain>-<action>.processor.ts`
  - `<domain>-<action>.handler.ts`
  - `<domain>-job.mapper.ts`
- `handler.ts` 不得承担跨阶段流程编排。
- 如出现 started -> execute -> finished 之类完整编排，应上移至 Usecase / Flow 层。

## 与 Usecase 协作约定

- Worker Usecase 的专项约束见 `docs/worker/worker-usecase.rules.md`。
- 本节仅定义 Adapter 与 Usecase 的协作边界。
- process：只调用一个与“处理该任务”直接对应的主用例入口（如 `consumeXxxJobUsecase.process`）。
- completed / failed / stalled：只调用该生命周期对应职责的单个 Usecase 入口。
- 不在 Adapter 内分叉业务流程。
- 每个运行时钩子只允许调用一个对应职责入口。
- 不得在同一钩子内串联多个业务阶段 Usecase。
- 若需要“记录失败 + 指标上报”等技术动作，应由该单一入口在内部完成。
- 不得由 Adapter 直接拆分串联多个入口。
- failed 事件若出现 `job` 缺失，Adapter 不得直接 return。
- 必须仍调用单一 Usecase 入口并传入显式降级上下文。
- Adapter 在 failed 且 `job` 缺失时，必须先调用单一 fail 入口。
- 传入显式降级上下文。
- 允许在调用后再抛错做告警，但不得在调用前直接抛错。
- 降级上下文至少包含可追踪字段。
- `queueName`、`jobName`、兜底 `jobId`、兜底 `traceId`。
- `occurredAt`、`reason`。
- 降级上下文由 Adapter 显式构造并传参。
- 禁止要求 Usecase 反查 BullMQ runtime 对象补齐字段。
- Adapter 负责将 attempts、timestamps、identifiers 等 runtime 字段归一化为内部语义字段。
- Usecase 不应感知其底层来源。

## 多进程运行时约束

- API 入队与 Worker 消费必须拆分为独立模块。
- WorkerModule 只导入运行时基础模块和 `*AdapterModule`，不承担业务编排。
- `*UsecasesModule` 由对应 `*AdapterModule` 间接引入。
- 避免在 WorkerModule 顶层编排业务依赖。
- 不依赖“隐式可见性”，所有 usecase 依赖在模块中显式 imports。
- Worker 进程只暴露运行时必需能力，不默认复用 API 进程的装配结果。
- 队列运行时异常、失败重试与并发控制属于 Worker 进程职责。
- 不得向业务 Usecase 泄漏为框架耦合。

## 补充说明

- Worker Adapter 是“运行时边界适配层”，不是“轻量业务层”。
- 是否允许监听多个生命周期事件，不取决于文件数量，而取决于是否仍然只做边界转换。
- 如果某个 Adapter 开始出现以下迹象，应考虑拆分或上移逻辑至 Usecase / Flow：
  - 需要串联多个 Usecase 才能完成一个运行时钩子；
  - 需要基于业务结果做条件分叉；
  - 需要处理补偿、事务、一致性策略；
  - 需要直接依赖业务 service 或外部系统。
