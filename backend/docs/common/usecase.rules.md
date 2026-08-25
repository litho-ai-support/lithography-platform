Purpose: Define orchestration, transaction, dependency, and permission guardrails for usecases.
Read when: You are adding or changing a usecase, or reviewing write-side orchestration.
Do not read when: You are only changing adapter DTOs, infrastructure wiring, or pure domain models.
Source of truth: This file defines usecase boundaries and overrides informal examples elsewhere.
For precedence, see docs/common/rule-precedence.rules.md.
For boundary contract naming, see docs/common/boundary-contract.rules.md.

# Usecase 说明

- Worker 场景下的专项约束另见 `docs/worker/worker-usecase.rules.md`。

## 目标与定位

- Usecase 负责写操作编排与业务流程协调。
- 上游由 adapters 调用，下游只依赖允许的 modules(service)、core、`src/types` 或 layer-owned boundary contract。
- 写语义一律在 Usecase 内完成。
  包括 C/U/D 的编排、校验、权限与错误映射。
- modules(service) 仅提供细粒度写操作。
  由 Usecase 统一编排。
- Usecase 可拥有少量 usecase-owned boundary contract。
  用于事务、调度等用例编排所需的运行时能力边界。
  这是一种边界模式，不是独立分层，也不意味着建立全局 boundary contract 层或 `ports` 层。

## 边界与依赖

- adapters → usecases
- usecases → modules(service) / core / `src/types`
- usecases 可依赖 usecase-owned boundary contract。
  该类 contract 只定义 contract / token / 最小共享类型，不承载业务流程实现，也不是独立分层。
  共享的 usecase 编排运行时能力统一放在 `src/usecases/common/ports/*.contract.ts`。
  `*.contract.ts` 是本仓库 lint 识别的 usecase-owned boundary contract 后缀；
  不使用 `*.port.ts` 新增并行约定。
  Port 只作为架构讨论术语出现，不作为新增文件后缀。
  单个用例私有能力优先 colocate 在该 usecase 附近。
- usecases → usecases 仅限同域编排型依赖。
- modules(service) → infrastructure / core / `src/types`
- 禁止 usecases 直接依赖 infrastructure。
- 禁止 adapters 依赖 modules(service) 或 infrastructure。
- Usecase 不得 import 或短暂持有 ORM Entity；ORM Entity 仅在 modules(service) 内部使用。
- 上游不得直接暴露 ORM Entity。
- 适配层不得返回 ORM Entity 或 QueryBuilder。
- Usecase 模块必须显式 imports 依赖模块。
  包括 modules(service) 模块或 usecases 模块。
- 禁止依赖 ApiModule 或 WorkerModule 的隐式可见性。
- 禁止依赖适配层转发。
- WorkerModule 不直接导入 `*UsecasesModule`。
  由对应 `*AdapterModule` 间接引入。
- 禁止在 WorkerModule 顶层编排 usecase 依赖。
  避免装配层职责膨胀。

## Usecase 依赖细则

- 仅允许依赖同域的编排型 Usecase。
- 不允许跨域依赖。
- 仅允许依赖 1 层。
- 不允许链式多跳依赖。
- 若确需 A → B → C，必须新增一个上层 Usecase 统一编排。
- 上层 Usecase 直接调用 B 与 C。
- 或直接调用底层 service。
- 禁止由 B 再调用 C。
- 不允许为获取某个 Service 而绕道依赖 Usecase。
- 禁止形成循环依赖。
- 多个 Usecase 共享的参数 / 结果 / View type，不得挂在某个 Usecase 文件本身导出。
- 共享类型应抽到同目录 `*.types.ts`。
  由相关 Usecase 共同依赖。
- 单个 Usecase 的执行输入 / 结果若只与其调用 adapter 共享，也放在相邻 `*.types.ts`；
  adapter 仅作 type-only 导入，不得从 `*.usecase.ts` 实现文件借类型。
- 若该类型还会被同域 modules(service) 使用，或已成为 bounded context 的稳定公共契约，
  应提升到 `src/modules/<bounded-context>/<bounded-context>.types.ts`。
- 禁止通过 import 另一个 Usecase 文件来复用其导出的类型。
  类型复用同样受“禁止链式依赖、禁止循环依赖”约束。

## 职责与输出

- Usecase 负责流程编排、事务边界、错误映射与权限组合，不创建 adapter-owned DTO，也不重复定义本应由 QueryService 统一的读侧 View。
- 纯读和写后读的稳定读侧口径交给 QueryService，避免多个 Usecase 各自拼装同一 View。
- Usecase 对 adapter 返回 QueryService 产出的稳定 View / ReadModel，或 usecase-owned 的流程 Result / summary；不得返回 ORM Entity。Adapter 再把这些结果映射为协议 DTO。
- Usecase 是 QueryService 唯一的上层调用者；同一 bounded context 内部允许 QueryService 以只读、无环方式组合其他 QueryService，详见 `docs/common/queryservice.rules.md`。
- 对于 Worker 生命周期中的降级输入，Usecase 必须接收显式上下文字段。
  例如 failed 事件缺失 `job`。
- Usecase 必须完成可查询的失败记录落库。
- 该类降级输入落库后应保证可追溯、可检索。
- 该类记录应支撑后续重试或人工决策。

## 读写协作方式

- 纯读放在 modules(service) 的 QueryService，便于复用。
- modules(service) 可提供基础写方法，但不得包含完整写语义或流程编排。
- Usecase 编排批量输入时，不得默认在循环中逐条 `await` 调用读写 service、QueryService、
  repository 封装或外部访问能力。
  应优先让下游提供批量读取/批量写入接口，由 usecase 做一次性收集、内存 diff 与批量提交。
  Review 时看到 `for` / `forEach` / `map` 搭配 `await` 数据访问，应默认按 N+1 风险检查。
- 单个读取若与批量读取语义相同，优先调用批量入口并传 `[id]` / `[key]`，不要新增并维护一套
  重复的单项读取逻辑。
- 跨域读只能由上层 Usecase 发起，通过被读域的 QueryService 获取。
- 跨域写通过事件或显式编排。
- `Outbox` 可作为一致性设计选项进行评估。
- 写后读优先走 QueryService，输出统一的稳定 View / ReadModel。
- 若写后读属于同域且读逻辑稳定，可复用 modules(service) 的只读方法。
- 输出仍以稳定 View / ReadModel 或 usecase-owned Result / summary 为准，不返回 Entity，也不在 usecase 创建协议 DTO。

## 错误与权限

- 业务错误统一使用 domain-error 中的 error_code。
- 写用例的流程级授权由 Usecase 负责。
- QueryService 不参与写侧决策。
- 细粒度授权可抽为同域 PermissionPolicy / AccessPolicy。
  可实现为纯函数或 service。
- 供 Usecase 与 QueryService 复用。
- Usecase 可以调用 QueryService 获取只读结果、View 映射或读侧校验结果。
- QueryService 不得反向调用 Usecase。

## 事务与外部系统

- 事务由 Usecase 定义与开启，modules(service) 不跨域开启事务。
- 事务 runner 属于 usecase-owned boundary contract，而不是 core-owned boundary contract。
- 该 contract 可由 infrastructure 实现并通过 DI 注入 usecase。
- 该 contract 不得被 adapters 依赖，也不得反向依赖 adapters、modules(service) 或 infrastructure 实现文件。
- `TransactionRunner` 是 usecase-owned transaction boundary contract 的当前固定命名。
  它不是 core-owned boundary contract，也不是独立 boundary contract layer。
  不新增并行 `TransactionPort` / `UnitOfWork` alias。
- 回调参数是 `PersistenceTransactionContext`；usecase 只显式传递该事务上下文，不直接接触
  TypeORM `EntityManager`。
- 基于 TypeORM `EntityManager` 的事务 alias 与 service 级事务入口已迁移，后续不得恢复。
- 一旦跨聚合或调用外部系统，Usecase 需先明确一致性策略与补偿策略。
- `Outbox` 在本仓库当前仅作为架构设计讨论。
- 尚未形成正式落地实现。
- 不要默认存在可直接复用的 `Outbox` 组件。

## 拆分原则

- 一个 Usecase 只处理一个写语义或一个业务流程。
- 当流程中出现多个独立的写语义时，拆分为多个 Usecase，由上层编排。
- 可复用的读侧输出口径由 QueryService 统一；流程专属结果由 owning usecase 定义，避免各 Usecase 重复定义同一读模型。
