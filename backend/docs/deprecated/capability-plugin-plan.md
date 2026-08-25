<!-- 文件位置: docs/deprecated/capability-plugin-plan.md -->

# Capability Plugin Plan

本文是 [Capability Plugin Direction](../../plans/capability-plugin-direction.md) 的执行计划。

Direction 保留为方向判断和边界依据；本文只回答当前基线项目按什么提交顺序落地。若 direction 与本文冲突，以 direction 的架构边界为准，本文再调整阶段和提交顺序。

## 目标

- 在当前单体 API / Worker 架构内落地能力插拔的最小运行时闭环。
- 先验证 technical capability，再处理 business capability 和 session contribution。
- 保持现有 `adapter -> usecase -> modules -> infrastructure` 分层不变。
- 保留现有业务调用模型：dispatcher / bus 只作为 usecase-owned runtime boundary，不作为新的业务编排模型。
- 让 `modules/common` 的瘦身和 capability 化同步推进。
- 当前基线只提供骨架和通用扩展点；真实业务项目只用于校验抽象是否足够通用，不把业务语义回填进基线。

## 全局设计原则

以下原则来自 direction，是所有阶段的实现约束；不要只在某个 commit 的局部语境里理解。

- 先定义边界，再选择通信方式。
- 当前只支持单体内 in-process 调用与 BullMQ queue transport。
- 共享数据库不是问题；问题是共享写所有权。
- 能力之间不共享 ORM Entity、Repository、QueryBuilder。
- 能力之间通过 command、query、event 或底座提供的稳定查询口径协作。
- Adapter -> Usecase 的现有调用语义不变；capability dispatcher 不是 adapter 的替代。
- 同一 capability 内部的 usecase -> module service / QueryService 调用不需要 envelope 化。
- Capability dispatcher 只用于 usecase 编排中的跨 capability 协作，或平台底座调度能力操作。
- Capability dispatcher 不得用于规避跨域 usecase 依赖、同域 usecase 一层依赖、多独立写语义需要 Flow Usecase 等既有规则。
- 跨能力写操作默认不使用分布式事务。
- 跨能力 command 默认不继承调用方 `TransactionRunner` 事务；不要假设 target capability 写入会随调用方事务回滚。
- 需要一致性时优先用幂等、状态机、补偿、审计记录和最终一致。
- API 入口、Worker 入口、队列声明和外部 provider 都应能被能力启停控制。
- 运行态关闭能力时返回统一错误，不删除能力数据。
- 底座能力保持稳定和少量；业务语义优先留在 business capability 中。
- 基线只提供通用插拔语义，不内置具体业务样本的专用抽象。

## 非目标

- 不删除或改名 `capability-plugin-direction.md`。
- 不在本计划中引入独立部署服务或远程 microservice transport。
- 不一次性重构全部 GraphQL resolver、worker handler 或 usecase module。
- 不把 `/var/www/backend_next` 的业务模块直接复制进当前基线。
- 不在 P0 引入完整 business capability 目录重组。
- 不为了 capability 化改变现有数据库迁移执行方式。
- 不把 account / auth 做成可选 capability；`platform.account` / `platform.auth` 只做底座只读声明。
- 不允许业务 capability 绕过 account / auth 等底座边界直接改写其内部实现。

## 提交原则

- 每个提交只完成一个可验证边界，不把 runtime、AI provider、queue、session、GraphQL surface 混在一起。
- 先加只读声明面和启动对账，再替换运行时分支逻辑。
- 先逻辑归属，后物理搬目录；除非目录移动本身没有行为风险。
- 每个阶段结束时都应能通过窄验证；不把已知破坏留到下一阶段修。
- 如果某一步发现需要突破 direction 的分层约束，停止实现并回到 direction 修正。
- 不为了少改代码而让 infrastructure 静态 import owner manifest，也不为了“统一”把业务编排藏进 registry / dispatcher。
- 代码结构本身应表达边界：owner 持有 manifest，runtime 负责发现和对账，usecase 持有业务流程，infrastructure 持有外部 I/O 实现。

## P0: Capability Runtime + `ai.*` 最小闭环

P0 是主线阻塞项。完成后，当前基线应有一个可启动、可对账、可观测的 technical capability 样本，但不要求所有能力都迁入 registry。

### C0.1 最小声明类型

新增 owner manifest 需要引用的最小声明类型，避免一开始把 direction 草案全部搬进 `src/types`。

建议落点：

- `src/types/common/capability.types.ts`

只包含 P0 真实跨层需要的声明类型：

- `CapabilityId`
- `CapabilityKind`
- `CapabilityProcess`
- `CapabilityManifest`
- provider contribution 子集
- queue contribution 子集
- runtime enable state 子集

不在 C0.1 引入完整 envelope、command/query/event bus、session principal、authority claim、API surface 类型；registry、Discovery、bootstrap check 的运行时实现类型先留在 capability runtime 内部，只有被跨层稳定依赖后再上收到 `src/types`。

验收：

- 类型通过 `@app-types/*` 引用。
- `CapabilityManifest` 核心字段包含 `id`、`kind`、`displayName`、`version`、`processes`。
- `src/types` 不 import Nest、TypeORM、GraphQL、core 或具体 capability 实现。
- 没有 `any`。

### C0.2 Registry Runtime 与 Discovery 实现

新增 capability registry 的最小 runtime、Discovery 收集和启动对账实现。

建议落点：

- `src/infrastructure/capability/capability-registry.ts`
- `src/infrastructure/capability/capability-discovery.ts`
- `src/infrastructure/capability/capability-bootstrap-check.ts`
- `src/infrastructure/capability/capability.module.ts`

职责：

- 通过 Nest provider / Discovery 收集 owner module 贡献的 manifest、provider binding 和 queue binding。
- 按当前 process 过滤启用项。
- 注册 `platform.account` / `platform.auth` 等只读 platform 声明；它们不参与 enableState 状态机。
- P0 只实现安装态、部署态和 process 装配过滤；运行态热启停与 kill switch 留到后续阶段。
- 启停状态不写入业务数据库；P0 来源只允许 manifest、env 和启动期装配。
- 校验 capability id 命名、重复 id、process mismatch、循环依赖、已声明 provider contribution 但缺 binding、queue binding 对账失败。
- 输出启动期 validation result。

约束：

- P0 不新增 usecase-owned `CapabilityRegistry` contract，因为 P0 没有业务 usecase 直接依赖 registry。
- 如果需要向 bootstrap 或装配模块暴露查询接口，先作为 capability runtime 的 platform-facing contract / token，后续只有被 usecase 编排直接依赖时才拆出 usecase-owned narrow contract。
- Nest Discovery / provider metadata / registry 实现归 infrastructure。
- modules 只贡献 manifest 和 provider binding，不静态 import infrastructure registry。
- infrastructure registry 不静态 import `src/modules/**` 或 `src/usecases/**` 的 manifest。

验收：

- 无 capability manifest 时可正常启动。
- 重复 id、非法 id、缺 provider binding 的测试覆盖。
- manifest 声明了 queue binding 但 BullMQ registry 中 queue/job 不存在时默认启动失败；manifest 未声明 queue binding 时不阻塞兼容启动。
- 测试覆盖 Discovery 收集路径，避免退化为静态 import 注册表。

### C0.3 `NestCapabilityPackage` 装配类型

把 direction 中的 `unknown` 收敛为正式实现类型。

建议落点：

- `src/infrastructure/capability/nest-capability-package.ts`

要求：

- module 字段使用 Nest `Type<unknown> | DynamicModule`，或本项目封装的等价类型。
- API / Worker bootstrap 可以按 process 汇总 package。
- 不建立 `src/capabilities` 作为新物理层。
- package 只表达装配 metadata，不拥有 manifest 真源，也不替代 owner module。

验收：

- API 进程只加载 `apiModule` 和必要 `sharedModule`。
- Worker 进程只加载 `workerModule` 和必要 `sharedModule`。

### C0.4 `ai.*` Provider Binding Manifest

以 AI provider registry 作为首个 capability 样本。

建议 capability id：

- `ai.local-mock`
- `ai.openai`
- `ai.qwen`

建议落点：

- `src/modules/common/ai-worker/ai-provider.capability.manifest.ts`
- `src/modules/common/ai-worker/providers/*` 保留现有 provider 实现位置

要求：

- manifest 声明 provider contribution，owner module 通过 Discovery 可见的 provider metadata 暴露 binding。
- manifest 声明 `AI_PROVIDER_MODE` 相关部署配置；P0 继续读取现有 config module，不引入数据库配置源。
- 保留 `AI_PROVIDER_MODE=mock/remote` 语义。
- mock 模式强制走 `ai.local-mock`。
- remote 模式按 provider name 查 registry。
- `getEmbedProvider()` 当前固定返回 mock provider，P0 重构必须保留该行为；后续若需要可用 manifest 显式声明 embed provider binding。
- unsupported provider 仍折叠到现有 `DomainError` 语义，不引入裸字符串错误。
- `AiProviderRegistry` 不再静态 import `LocalMockAiProvider`、`OpenAiGenerateProvider`、`QwenGenerateProvider`；具体外部 SDK / HTTP provider 仍由 infrastructure module 提供，通过 DI token 或 provider binding 注入。
- provider name、capability id、client instance 的绑定关系来自 discovery registry，不来自 `if providerName === this.xxxProvider.name` 分支。

验收：

- `AiProviderRegistry` 不再硬编码 provider 构造字段和 `if providerName === ...` 分支。
- 现有 provider registry 单测覆盖 mock、openai、qwen、unsupported。
- 测试证明新增 provider binding 不需要修改 `AiProviderRegistry` 分支。

### C0.5 AI Queue Contribution 对账

把现有 BullMQ registry 与 capability manifest 建立声明面关联，不重造队列 registry。

建议范围：

- `BULLMQ_QUEUES.AI`
- `BULLMQ_JOBS.AI.GENERATE`
- `BULLMQ_JOBS.AI.EMBED`
- `BULLMQ_JOBS.AI.WORKFLOW`

要求：

- manifest 声明 queue contribution。
- 启动对账校验 manifest 中的 queue/job 存在于 `job-contract.registry.ts` 和 `queue-registry.ts`。
- 调和字段命名：direction 中 `durationMs` 映射当前 `BullMqQueueRuntimePolicy.limiter.duration`；P0 不为了 capability 化重命名现有 BullMQ registry。
- 明确 capability id / operation 到 queueName / jobName 的映射位置；`queueName + jobName` 继续使用当前 BullMQ registry 真源，不强行改成 capability id。
- 记录 queue transport 的 envelope -> BullMQ job 映射规则，P0 只做声明和对账，实际序列化在 C3.0 引入 dispatcher 后落地。
- BullMQ job data 应包含序列化后的 envelope，至少保留 `capability`、`operation`、`operationKind`、`context`、`idempotencyKey`、`dedupKey`、`payload` 和 `createdAt`。
- `traceId` / `requestId` 来自 `envelope.context`；BullMQ `jobId` 不得替代 `traceId`。
- `dedupKey` 映射为 BullMQ `jobId` 或 dedup option 时，必须由 queue binding 策略显式声明。
- Worker adapter 从 job data 恢复 envelope，并用 envelope context 初始化 `CapabilityRequestContextStore`。
- `CapabilityQueueEnqueueInput` 作为 transport 内部结构，不暴露给业务 usecase。
- P0 只补声明面和启动对账，不重写现有 AI 入队 usecase，也不引入完整 command/event dispatcher。
- P0 不实现 queue disabled / kill-switch policy；只在 manifest 中保留声明面或 followup。
- AI workflow handler 可先作为 flow handler contribution 的声明对账样本，继续复用现有 Discovery registry，不重写 workflow runtime。

验收：

- 现有 AI 入队和 Worker 消费行为不变。
- queue/job 拼写错误时启动对账失败。
- capability queue contribution 缺失时，AI 运行时仍可选择兼容启动；但一旦声明了 contribution，声明内容必须与 BullMQ registry 对账通过。

### C0.6 Capability Error 最小映射

P0 补齐 capability disabled / unavailable 语义的最小错误结构，避免 provider binding 或 queue contribution 失败时各自发明错误。

要求：

- 定义最小 `CapabilityError` / `CapabilityResult` 子集，覆盖 `CAPABILITY_DISABLED`、`CAPABILITY_OPERATION_DISABLED`、`CAPABILITY_TEMPORARILY_UNAVAILABLE`、`CAPABILITY_PROVIDER_UNAVAILABLE`、`CAPABILITY_INTERNAL_ERROR`。
- 对外仍遵守现有 GraphQL error contract；如果 capability error 穿透到 adapter，必须折叠为稳定 `error_code` / extension 结构。
- capability 内部仍可使用 `DomainError`；边界处由 handler / registry / adapter helper 折叠，不允许裸字符串错误。
- `CAPABILITY_IDEMPOTENCY_CONFLICT` 的 GraphQL 映射按 conflict 语义保留给 dispatcher 阶段。

验收：

- disabled / unavailable 至少有 unit test 覆盖。
- 现有 GraphQL error contract 不回退。

### C0.7 P0 验证与收口

建议验证：

- `npm run typecheck`
- `npm run lint`
- AI provider registry 相关 unit test
- BullMQ job contract / queue runtime 相关 unit test
- Worker 相关窄 e2e 或 `npm run test:e2e:worker`

P0 完成条件：

- `ai.*` technical capability 可以被 registry 发现。
- Provider binding 和 queue contribution 都能启动对账。
- API / Worker 进程可以按 process 装配 capability package。
- 旧 AI 行为不回退。

P0 验证备注：

- `ai-worker-consume-persistence` 曾暴露 `provider_latency_ms` 负数写入 `int unsigned` 的既有缺陷；实现时应在 provider call record 写入前把负数或超出 unsigned int 范围的 latency 归一化为 `null`。
- 若完整 `test:e2e:worker` 在该文件 13 个用例均通过后仍报 `Can't add new command when connection is in closed state`，这是 Worker failed lifecycle 事件晚于测试 DataSource 关闭的收尾问题，不应归因于 capability bootstrap / DI；另案修复 worker runtime 或 e2e teardown 的关闭等待语义。

## P1: Notification / Third-party Technical Capability 与 `modules/common` 瘦身

P1 不引入新的业务模型，重点是复用 P0 runtime，把第二类 technical capability 接入，验证 `modules/common` 的归属判断。

### C1.1 `notification.email` Capability

范围：

- `src/modules/common/email-queue`
- `src/modules/common/email-worker`

要求：

- 增加 `notification.email` owner manifest，并通过 Discovery 可见的 provider metadata 暴露。
- 声明 email queue contribution，不让 infrastructure 静态 import email manifest。
- 对账 `BULLMQ_QUEUES.EMAIL` 与 `BULLMQ_JOBS.EMAIL.SEND`。
- 保持现有 email queue usecase 和 worker 行为不变。

验收：

- email queue/job 拼写错误时启动失败。
- 现有 email enqueue / worker 测试通过。
- `notification.email` 不把 verification flow 决策吸入 technical capability；若 email verification 包含流程决策，应留在 owner flow 或 platform verification。

### C1.2 `third-party-auth.weapp` Manifest

范围：

- `src/modules/third-party-auth`
- `src/infrastructure/third-party-auth`

要求：

- 只补 owner manifest、provider binding 和启停对账。
- 不改变既有 module-owned contract 方向。
- 不把 HTTP provider 放回 modules。
- manifest 通过 owner module 暴露，不让 infrastructure 静态 import third-party-auth manifest。

验收：

- manifest id 使用 `third-party-auth.weapp`。
- infrastructure provider 仍只通过 contract 注入。
- 关闭或缺 provider binding 时按 capability disabled / unavailable 语义失败，不泄漏 HTTP provider 细节。

### C1.3 `modules/common` 归属审计

输出一个小型清单或 followup，标记当前 `modules/common` 子目录归属。

建议初始判断：

- `ai-queue` / `ai-worker`：`ai.*`
- `email-queue` / `email-worker`：`notification.email`
- `password` / `security` / `tokens`：platform common
- `pagination` / `search`：当前同时存在 `modules/common` 的 Nest wrapper 和 `core` 下的纯类型 / 策略，先按 platform common wrapper + core policy 处理
- logger templates：platform common 或 infrastructure adapter helper，按现有规则保持
- `utils`：逐项审视，能归 owner 的后续迁走

验收：

- 不要求 P1 物理搬目录。
- 每个 common 子目录都有“保留 / 迁移 / 待审视”结论。
- 归属审计只产出 owner 判断，不以“为了 common 变少”为目标强行搬目录。

P1 实施判断：

- `ai-capability` / `ai-queue` / `ai-worker`：归 `ai.*` technical capability。
- `email-capability` / `email-queue` / `email-worker`：归 `notification.email` technical capability；当前本机 `sendmail` 实现按 `notification.email.sendmail` provider capability 建模。
- `password` / `security` / `tokens`：继续保留为 platform common，不作为可选业务能力迁移。
- `utils`：暂标为待审视，只在后续出现明确 owner 时迁移。
- 当前基线没有 `modules/common/pagination` 或 `modules/common/search`；分页与搜索相关纯规则仍按 `src/core/` 归属处理。

### C1.4 Technical Capability Health Check

为外部系统型 technical capability 补最小健康检查声明，不做运维面板。

范围：

- `ai.*` provider binding
- `notification.email`
- `third-party-auth.weapp`

要求：

- health check 由 owner capability 声明，具体探测实现仍归 infrastructure。
- registry 只负责收集和暴露健康状态，不把健康检查写成业务 usecase。
- 健康检查失败不等同于 runtime disabled；是否触发 kill switch 留到后续阶段。

验收：

- provider 未注册与 provider 健康失败能区分。
- 外部系统错误不泄漏 SDK / HTTP 细节。

### C1.5 Capability Config Reader 收口

当第二类 technical capability 接入后，再判断是否需要把 direction 中的 config reader 从具体实现中抽出。

要求：

- 只读取现有 config module / env 归一化后的结果，不引入业务数据库作为启停或 provider config 真源。
- manifest 的 config definition 只声明 key、来源和运行态语义，不直接承载 secret value。
- 若只有 `ai.*` 用到 provider config，保持 C0.4 的局部实现，不提前抽全局 reader。
- 一旦 `notification.email` 或 `third-party-auth.weapp` 也需要相同读取语义，再提取 `CapabilityConfigReader` narrow contract。

验收：

- 不 hardcode URL、token、secret。
- 不出现 capability runtime 反向读取业务模块配置实现。

## P2: Session Contribution、Reference Fixture 与 Platform Account 边界

P2 建立 session principal / authority claim 的运行时接口，并提供一个不进入默认业务装配的 reference capability / contract fixture。Fixture 用于代码化 direction 中的 `CLIENT / RESOURCE_MANAGER` 样例，防止后续生成真实 capability 时接口形态漂移。

### C2.1 Session Context Builder Contract

建议落点：

- `src/usecases/common/ports/capability-session-context-builder.contract.ts`
- `src/infrastructure/capability/capability-request-context.store.ts`
- `src/infrastructure/capability/capability-session-context.builder.ts`

要求：

- builder 是平台底座的 usecase-owned runtime boundary。
- infrastructure 用 AsyncLocalStorage 实现 request context store。
- GraphQL / HTTP adapter、guard 或 middleware 只通过 DI token 调用 builder。
- 首个实现从当前 JWT 兼容字段填充 `accountId`、`activeRole`、`accessGroup`、`source`。
- 若存在已对账通过的 session identity resolver / authority summary resolver，builder 可填充 `principalCodes` 与 `authorityClaims`。
- authority claim 首个实现只进入 `CapabilityRequestContext`，不写入 JWT。
- 定义最小 `CapabilityEntryPoint` 值域，当前基线只启用 `graphql-api` 与 `worker`；`admin-api` 等后续有真实入口再加入。
- `CapabilityEntryPoint` 不等同于 JWT audience，adapter 不得把 JWT `aud` claim 直接当作 capability entry point。

验收：

- 不引入 Nest request-scoped provider 链式扩散。
- 不让 adapter 直接 import modules service 或 infrastructure runtime 实现。
- `CapabilityRequestContextStore` 覆盖 `run` / `getCurrent` / `requireCurrent` 行为。
- builder + store 集成测试证明构建出的 context 可在 AsyncLocalStorage 边界内读取。

### C2.2 Session Principal / Authority Claim Registry

要求：

- 支持 manifest 声明 `session.principals` 和 `session.authorityClaims`。
- 启动对账 identity resolver、summary resolver、scope authorizer。
- 当前基线真实运行时可以只有 platform principal 兼容投影；业务 claim 只通过 reference fixture 参与测试，不进入默认 API / Worker 装配。

验收：

- 未注册 resolver 时启动失败。
- `subjectPrincipalCode` 引用不存在时启动失败。
- 首个实现可以不把 authority claim 投影进 JWT。

### C2.3 Reference Session Capability Fixture

建议落点：

- `test/support/capability/session-reference.fixture.ts`，或等价的非默认运行时目录

要求：

- 实现 direction 中的 `CLIENT` principal 和 `RESOURCE_MANAGER` authority claim 样例。
- fixture 包含最小 manifest、identity resolver、summary resolver、scope authorizer 和 session projection 示例。
- fixture 只被 registry / bootstrap / session contribution 测试加载。
- fixture 不出现在默认 API / Worker module imports，不进入真实 JWT、账号、权限、菜单或数据库迁移。
- fixture 不写入 `platform.account`，不放进 `modules/common` 作为业务能力。

验收：

- fixture 能通过 Discovery / provider metadata 被测试 registry 收集。
- 缺失 resolver、缺失 authorizer、`subjectPrincipalCode` 错误时测试失败。
- fixture 的存在不改变默认应用启动和真实 auth/session 行为。

### C2.4 Account 边界沉淀

目标：

- 明确 `platform.account` 只持有 base account / access / session 机制。
- 为未来业务身份从 account 中拆出准备 contribution 接口。

要求：

- 不把业务身份写入当前基线。
- 不修改现有 auth/session GraphQL contract 的稳定行为。
- 若需要文档沉淀，先进入 followup 或 plan，不直接改稳定 rules。

### C2.5 P2.1 Session Runtime 收口

P2.1 是 P2 的实现收口，不扩大到 P3 dispatcher，也不改真实 auth/session 对外行为。

要求：

- `CapabilityRegistry` 提供 session identity resolver、authority summary resolver、scope authorizer 的窄查询入口。
- decorated resolver 必须具备对应方法；装饰器存在但实例不可调用时，启动对账按缺 binding 处理。
- reference fixture 从“可发现”升级为“可调用”，继续只参与测试，不进入默认 API / Worker 装配。
- `NestCapabilityPackage` 保持 Type / DynamicModule 类型锚点，只补使用时机说明，不在 P2.1 强行接入 bootstrap。

测试：

- 依赖循环检测：`A -> B -> A` 失败，线性依赖通过。
- Session contribution：跨 capability `subjectPrincipalCode` 有 `dependsOn` 时通过；resolver / authorizer 不可调用时失败。
- Session builder：JWT 兼容字段可构建 context；reference fixture resolver 可填充 `principalCodes` / `authorityClaims`。

## P3: Capability Boundary Runtime 与 Surface 对账

P3 等 technical capability、session contribution 和 reference fixture 稳定后再推进。它需要真实业务语义或从业务项目回投的明确样本；当前基线不虚构业务域。

P3 的目标是收口 capability 边界、声明面和启动对账，不实现运行态启停、真实 queue transport、event publisher 或 capability-aware GraphQL disabled guard。当前基线没有足够小且真实的 business capability 可作为默认 pilot，因此先落 GraphQL surface、data resource 与 resource claim 的通用声明和启动对账；`client` / `resource-manager` 只保留为测试 fixture 样本，不进入默认装配。真实 business capability pilot 继续等待明确业务样本后再推进。

### C3.0 Dispatcher / Bus / Envelope 最小 Boundary

P0 到 P2 保留现有直接调用模型，不通过 dispatcher 重写既有流程。进入 business capability pilot 前，再引入 direction 中的最小 runtime boundary。

P3a 锁定范围：

- 只实现 C3.0 runtime，不推进真实 business capability pilot。
- Queue transport 只做接口和 operation -> queue/job 对账，不重写现有 AI / Email 入队，不改 Worker adapter。
- Event 只做 publisher / subscriber contract 与 fixture discovery，不做真实 fire-and-forget 派发、审计或重试。
- GraphQL surface 对账、resource claim 对账和真实 business capability pilot 分别留给 C3.1-C3.3。

要求：

- 引入 command / query / event bus 的窄接口，usecase 只注入自己需要的 bus。
- bus / dispatcher contract 落在 `src/usecases/common/ports`；in-process / queue transport 实现落在 infrastructure。
- 引入 `CapabilityEnvelope` / `CapabilityResult` / `CapabilityError` 的完整运行时折叠链路。
- dispatcher 只能作为 usecase-owned runtime boundary，用于可选能力、跨进程 queue、启停检查、权限前置、context 传播和错误折叠，不作为新的业务编排模型。
- in-process transport 只调用当前进程已装配 operation；跨进程协作必须走 queue transport 或后续 remote transport。
- event publisher / subscriber 在此阶段落地最小语义；需要可靠重试的 event 走 queue transport，in-process event 只保证派发一次和失败审计。
- permission checker 在 dispatcher 前置检查中接入；P3 前不把权限 manifest 当作前端功能点真源。
- `operationVersion` 和远程版本协商继续保留为后续扩展，不阻塞当前单体 API / Worker 场景。

验收：

- usecase 仍持有业务流程和事务边界。
- dispatcher 不持有业务事务，跨 capability 写默认独立事务并依赖幂等 / 补偿。
- direct call 与 dispatcher call 的边界在测试中可区分。
- manifest 声明 in-process command/query 但缺 handler 时启动对账失败。
- handler 注册但 manifest 未声明 operation 时只产生 non-blocking warning。
- queue operation 可解析到现有 BullMQ queue/job descriptor，但不会 enqueue。
- event subscriber fixture 可被 registry 发现，但不会触发真实副作用。

### C3.1 GraphQL Surface 对账

要求：

- manifest 声明 GraphQL operation。
- API bootstrap 从 schema 或显式注册表对账 resolver。
- P3 只做 schema surface 启动对账；部署态 / 运行态关闭保持 schema 一致、通过 guard / resolver 返回 capability disabled 的能力放到 P4 runtime。
- GraphQL resolver / DTO 仍归 adapters，manifest 只做 surface 声明和对账真源。

验收：

- manifest 声明的 GraphQL operation 在 schema 中缺失时，API 侧启动对账失败。
- 旧 resolver 未声明 manifest 时不失败，便于渐进 capability 化。
- 对账逻辑在 API adapter / bootstrap 侧触发，不让 infrastructure registry 静态 import resolver。

### C3.2 Resource Claim 与 Ownership 对账

范围：

- `externalResource`
- `artifact`
- `authorizationResource`

要求：

- 只对真实出现的资源类型做启动对账。
- 不把业务资源枚举上收到基线。
- `readShared` 只表达数据资源的共享读取声明，不代表其他 capability 可以绕过 owner 的 Query operation 直接跨 capability 读表。
- 跨 capability 读取仍优先通过 owner 的 Query operation；若确实需要同进程模块级共享读取，必须单独写清读口径、权限和依赖方向。

验收：

- `data.resources`、`data.migrations` 和 `resourceClaims` 的非法声明产出结构化 bootstrap issue。
- `relation: owns` 的 owner 必须是当前 capability。
- `relation: dependsOn | contributes` 指向其他 capability 时，当前 manifest 必须声明对应 dependency。

### C3.3 Business Capability Pilot

真实 business capability pilot 不在当前 P3 阻塞主线。出现足够小且真实的业务样本后再推进，要求它至少包含：

- manifest
- operation 声明
- usecase handler
- QueryService 或 module service
- GraphQL surface 声明
- 权限声明

约束：

- pilot 必须先写清 owner bounded context，不能把多个既有域打包成一个“方便演示”的 capability。
- pilot handler 只能落在 usecase 层或该 capability owner 的合法 layer 中，不允许 adapter 直接调 handler。
- 多独立写语义必须回到 Flow Usecase，不用 dispatcher 隐藏流程。
- 若 pilot 暴露 direction 未覆盖的新 contribution 形态，先更新 direction，再实现 plan。

## P4: Runtime Enablement & Transport

P4 承接 direction 中必须完成、但当前 P3 不实现的运行态能力。P4 之前不得把 runtime disabled、queue transport 或 event publisher 描述成已可用。

### C4.1 Runtime State 与 Kill Switch

要求：

- 明确安装态、部署态、运行态、kill switch 的来源和优先级。
- `platform.*` 不参与 enableState 状态机，依赖校验中恒视为 enabled。
- 运行态关闭返回统一 capability error，不删除能力数据。
- 健康检查失败不自动等同 disabled；是否触发 kill switch 由单独策略决定。
- 启停状态不写入业务数据库；运行态配置来源应走平台配置或健康降级通道。

验收：

- disabled / operation disabled / kill switch 的错误语义有单测覆盖。
- runtime state 查询不反向依赖业务 modules。

### C4.2 GraphQL Runtime Guard / Resolver 语义

要求：

- code-first schema 保持一致；能力关闭时不动态摘 resolver。
- capability-aware guard 或 resolver helper 返回 `CAPABILITY_DISABLED` / `CAPABILITY_OPERATION_DISABLED`。
- adapter 仍只解析输入、调用 usecase、映射输出；不得把 dispatcher 当成 resolver 的通用替代入口。

验收：

- 能力关闭时 GraphQL schema 不变。
- GraphQL error contract 不回退。

### C4.3 Queue Transport

要求：

- 实现 dispatcher queue transport 的 envelope -> BullMQ job data 映射。
- `queueName + jobName` 继续以 BullMQ registry 为真源，不强行改为 capability id。
- `traceId` / `requestId` 来自 `envelope.context`；BullMQ `jobId` 不得替代 trace。
- `dedupKey` 映射为 jobId 或 dedup option 时，必须由 queue binding 策略显式声明。
- Worker adapter 从 job data 恢复 envelope，并用 envelope context 初始化 `CapabilityRequestContextStore`。
- 跨进程 capability 协作必须走 queue transport 或后续 remote transport，不走 in-process。

验收：

- API 进程无法 in-process 调用 worker-only operation。
- queue transport enqueue 与 worker context restore 有窄测试或 worker e2e 覆盖。

### C4.4 Event Runtime

要求：

- 补齐 event publisher token / provider。
- in-process event 默认 fire-and-forget，只保证派发一次。
- in-process subscriber 失败进入审计或结构化记录，不冒泡回发布方。
- 需要可靠重试的 event 应声明走 queue transport。
- `CapabilityEvent.eventId` 由发布方生成并全局唯一，用于订阅方幂等；`idempotencyKey` 保留给 command 调用幂等。

验收：

- event publisher / subscriber 路径与 command / query handler 路径在测试中可区分。
- in-process event 不承诺自动重试。

### C4.5 Permission Runtime

要求：

- 当前 allow-all checker 只作为 bootstrap 默认值或测试 fallback。
- 后续 permission checker 应接入后端权限真源，不与前端菜单 / 功能点 manifest 共用。
- operation 级 `requiredPermissions` 优先；permission manifest 只做声明、启动对账和文档/派生用途。
- in-process 场景权限检查优先使用启动期或请求期内存映射，避免每次跨 capability 调用查库。

验收：

- dispatcher 前置权限检查仍发生在 handler 调用前。
- 权限失败统一折叠为 `CAPABILITY_PERMISSION_DENIED`。

## P5: 稳定规则沉淀

P5 只在 P0 到 P4 的实现被测试验证后推进。

P5 需要先收口 P4 runtime 的稳定化尾项，避免最小闭环长期停留在“可用但语义未沉淀”的状态：

- Runtime state reader 与 permission checker 的配置读取策略：明确启动期静态配置、热配置或带版本的刷新机制；在此前不做永久 cache，避免破坏未来 runtime enable / kill switch 热读语义。
- `ConfigService` 缺失的诊断策略：生产环境不得让 kill switch 因 DI 缺失静默失效；可选择移除 optional 依赖，或在非测试环境启动期输出 warning。
- Queue transport 的 dedup 策略：补齐 `jobId`、`bullmq-dedup-option`、`none` 的测试与语义说明；删除实现中不表达真实差异的特殊分支。
- Worker queue failure 语义：`CapabilityError` 转 BullMQ 失败时应保留 `details` / reason；已入队任务在 disabled / kill switch 下的处理应回到 capability queue runtime policy，而不是只依赖 BullMQ attempts。
- Event runtime 可靠性边界：in-process event 失败当前只要求结构化记录和不冒泡；需要可靠重试或审计时，应显式声明 queue transport 或独立审计通道。
- GraphQL runtime guard：补齐 class-level decorator 用法测试；是否继续用 `DomainError` 承接 GraphQL error contract，或统一为 `CapabilityError -> adapter fold`，应在 P5 规则沉淀时定稿。
- Permission runtime：`principalCodes` 与 `authorityClaims` 当前按全局 code 集合匹配；P5 需写入规则并补测试，避免后续 capability 生成出局部同名 code。

输出：

- 将稳定边界迁入 `docs/common/*.rules.md` 或新增对应 rules。
- 将仍未完成的尾项拆到 `*-followup.md`。
- 将已经完成且只保留背景价值的内容归档到 `docs/deprecated/`。

不在 P5 前把 direction 删除；direction 继续保留为历史判断和架构解释。

## 总体验收

- `npm run typecheck`
- `npm run lint`
- 能力 registry / bootstrap check unit tests
- AI provider registry unit tests
- BullMQ queue/job contract tests
- Capability error mapping tests
- Technical capability health check tests
- Dispatcher / bus / envelope tests 在 P3 引入后补齐
- Runtime state / queue transport / event runtime tests 在 P4 引入后补齐
- Worker e2e 或相关窄 e2e
- GraphQL error contract 不回退

## 风险控制

- 如果 P0 无法在不改业务调用模型的前提下落地，说明 runtime 抽象仍过重，应回退到 direction 重新裁剪。
- 如果某个 common 子目录无法判断归属，不强行迁移，先标为待审视。
- 如果 session contribution 迫使 adapter 承担业务编排，应停止实现并改回 usecase-owned boundary。
- 如果业务 capability pilot 需要多个独立写语义，应先设计 Flow Usecase，不用 dispatcher 隐藏流程。
- 如果 P4 runtime 迫使 GraphQL adapter 绕过 usecase 或把业务流程藏进 dispatcher，应停止实现并回到 direction 修正。
