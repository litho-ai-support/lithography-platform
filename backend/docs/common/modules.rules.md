<!-- docs/common/modules.rules.md -->

Purpose: Define service reuse, dependency, and exposure guardrails for modules(service).
Read when: You are implementing, reviewing, or refactoring modules(service) or QueryService placement.
Do not read when: Your task does not change modules(service) responsibility boundaries.
Source of truth: This file defines modules(service) boundaries; code examples elsewhere must not override it.
For boundary contract naming, see docs/common/boundary-contract.rules.md.

# Modules(service) 说明

## 定位与职责

- Modules(service) 承载同域内可复用的读写服务。
  通过 DI 承接 infrastructure 实现。
- Modules(service) 聚焦单一 bounded context 的能力复用，不做跨域编排。
- Modules(service) 对上游提供 View、ReadModel、Record snapshot 或明确的稳定 data shape，
  不直接暴露 ORM Entity，也不创建 adapter-owned DTO。
- `src/modules/common/*` 属于 Modules(service) 体系内的受限共享层。
  用于承载横切、稳定、非业务专属的通用能力。
  例如安全辅助、分页、邮件发送、队列网关封装、通用 worker/provider registry。

## 允许内容

- 同域读服务与细粒度写服务。
- ORM Entity 与 Repository 的内部使用与封装。
- 接收 usecase 传入的 `PersistenceTransactionContext`，并在同一事务内执行细粒度写入。
- QueryService 归属 modules(service)。
  只读与读侧输出整形在此完成。
- 与 core-owned boundary contract 交互的同域适配逻辑。
- 通用能力模块化。
  通过 DI token 绑定 infrastructure 实现。
- Module 级 provider factory 可读取 `ConfigService`，用于把运行时配置归一化为本模块内部
  options token。
  Service、QueryService、provider 执行逻辑不得直接读取 `ConfigService` 或 `process.env`。
- Modules(service) 可拥有 module-owned boundary contract / token，用于隔离本模块所需的
  infrastructure 实现。
  仅在模块需要隔离可替换实现时使用，不应为普通 service 机械创建。
  Boundary contract 是归属某一层的边界模式，不是独立分层；不得建立全局 boundary
  contract 层或 `ports` 层来集中放置所有接口。
  新增边界文件使用 `*.contract.ts`，不使用 `*.port.ts` 新增并行约定。
- 对外只导出 service、必要 DI token 与稳定类型。
- 同域多层共享的稳定 View / contract type 可放在 bounded context 根 `*.types.ts` 对外暴露。
- 领域专用排序解析器。
  只负责排序白名单与列解析。
- 不引入业务规则。
- 业务域模块可依赖 `src/modules/common/*` 提供的共享能力。
- `src/modules/common/*` 可依赖 infrastructure / core / types。
- `src/modules/common/*` 内部可按能力目录拆分 module / service / provider / helper / types。

## 禁止内容

- 跨域读写编排与事务边界控制。
- 业务域 modules(service) 直接依赖其他业务域 modules(service)。
  例如 `account` 不直接依赖 `verification-record`；同层 bounded context 间协作必须上提到 usecase 编排。
- 提供全局事务入口。
- 提供可被跨 bounded context 复用的 `runTransaction`、`withTransaction`、`transaction` 包裹方法。
- 直接依赖 transaction boundary contract。
  当前包括 `TransactionRunner`；历史或讨论名如 `TransactionPort`、`UnitOfWork` 也不得新增或依赖。
- 为了让上游获得事务能力而暴露业务 service。
- 在 modules(service) 内开启跨聚合或跨 bounded context 事务。
- 直接被 adapters 依赖。
- 在 service 内部开启跨域事务。
- 对上游返回 ORM Entity 或 QueryBuilder。
- `src/modules/common/*` 反向依赖业务域模块。
  例如 `auth`、`account`、`verification-record`、`third-party-auth` 等。
- 在 `src/modules/common/*` 中放置业务实体、业务仓储、业务专属 QueryService。
- 将某个业务域暂时抽空后，仅把残余实现改名为 `common` 继续复用。

## 依赖方向

- 允许 modules(service) → infrastructure | core | `src/types`；`src/types` 统一通过
  `@app-types/*` 引用。
- 禁止 modules(service) → adapters。
- 上游依赖方向为 usecases → modules(service) | core。
- 允许业务域 modules(service) → `src/modules/common/*`。
- 禁止业务域 modules(service) → 其他业务域 modules(service)。
- 禁止 `src/modules/common/*` → 业务域 modules(service)。
- Boundary contract 的归属跟随能力需求的拥有层。
  纯领域能力归 core；usecase 编排能力归 usecase；模块内部可替换实现归 modules(service)。
  不建立全局 boundary contract 层。
- Port 只作为架构讨论术语出现；正式规则使用 boundary contract。
- Infrastructure 只实现或适配 boundary contract，不通过 contract 承载业务规则。
- 若 `src/modules/common/*` 需要业务协作型依赖，不得直接依赖业务域 service。
  contract 归属于实际拥有该协作需求的层；provider 绑定由业务模块或装配模块提供。
  只有纯领域能力才下沉到 core。
- 当模块本身需要外部注入业务协作依赖时，优先通过动态模块 `register()` / `forRoot()` 接收 provider 绑定。
  不要在模块内部直接 import 业务域 service 兜底。
- adapters / usecases 若只是为了复用某域稳定类型，只允许 type-only import 该域根
  `*.types.ts`。
  不得为了借类型而 import 该域的 service / query service / entity 实现文件。
- usecases 正常编排某域能力时，允许注入并调用该域 modules(service) 暴露的 service /
  QueryService；但不得直接 import entity、repository 或 QueryBuilder。

## 设计原则

- 读写分离。
  纯读放在 QueryService。
- 写操作由 usecases 统一编排。
- 事务边界由 usecase 持有。
- modules(service) 只接收事务上下文，不拥有全局事务入口。
- modules(service) 不直接依赖 transaction boundary contract。
- modules(service) / QueryService 对外事务参数使用
  `transactionContext?: PersistenceTransactionContext`。
- modules(service) / QueryService 内部需要 TypeORM `EntityManager` 时，可通过 infrastructure
  helper `getTypeOrmEntityManager(transactionContext)` 解包为 `EntityManager`。
  不导出 `*TransactionManager = EntityManager` 这类供上层复用的 alias。
  ESLint 会阻止 modules 中新增 `*TransactionManager` alias。
- 细粒度服务。
  单方法单语义，便于用例复用与事务编排。
- 批量数据访问优先。
  面对随业务数据量增长的输入集合时，modules(service) / QueryService 应优先批量读取、
  内存 diff、批量 insert / update / upsert；避免在循环中逐条执行 repository / QueryBuilder
  的 CRUD。
  若必须逐条处理，需有明确原因，例如强顺序、行级锁、单条失败隔离、外部接口限流，且输入规模
  有清晰上限。
- 读接口优先集合化。
  当单个读取与多个读取语义相同时，优先提供 `listByIds({ ids })` / `findByKeys({ keys })`
  这类批量入口；单个值作为 `[id]` / `[key]` 调用同一逻辑，避免维护两套重复查询口径。
- 读侧输出整形。
  对外输出去敏感字段的 View、ReadModel 或 Record snapshot；协议 DTO 由 adapter 映射。

## Account / UserInfo 当前稳定边界

- `AccountService` 当前只承接 account / userInfo 域内细粒度写入、必要锁能力与登录历史写入。
- `AccountService` 不承接其他业务域身份档案或管理能力。
- nickname 生成、注册前账号唯一性查询、account view 映射等能力应按稳定度收敛到同域 service 或 QueryService。
- account / userInfo 的读侧查询与 view 映射优先归属 `AccountQueryService`。
- 注册前账号唯一性读取可归属同域 QueryService。
- 密码哈希 / 验证应归属通用密码能力或账号域明确 service，不应散落在 usecase / adapter。
- `accessGroup` 与 `metaDigest` 的同步必须通过显式写入口表达。
  不得伪装成普通 userInfo patch。
- `AccountService.runTransaction()` 与类似 service 级事务入口已迁移到 usecase-owned `TransactionRunner`。
  新写流程不得在业务 service 上恢复通用事务入口。

## VerificationRecord 当前稳定边界

- `VerificationRecordService` 是 `VerificationRecord` 聚合写入口。
- `VerificationRecordService.createRecord()` 负责创建验证记录。
- `VerificationRecordService.consumeRecord()` 负责消费状态落账、消费时 target 绑定与失败原因解析。
- `VerificationRecordService.revokeRecord()` 负责撤销状态落账与失败原因解析。
- Issuer service 负责 token 生成、重复检查与签发编排，最终仍通过聚合写入口写入。
- verification-record 同域纯规则承载状态机与 target constraint。
- `VerificationRecordQueryService`、`ConsumableQueryService` 与只读 repository 保持只读语义。
- 预读验证记录、可消费记录读取都不得在 QueryService 中写库。
- 需要绑定 target account 时，应在同一次消费语义中表达，不得拆成 QueryService 顺手补写。

## 结构与命名

- 按 bounded context 划分模块目录。
- 模块内部再区分 service、queries、entities。
- 命名以本层稳定领域语义为主；外部系统、协议、存储、UI 控件、SDK 或历史实现的偶然语义，
  进入业务 service / usecase / 共享类型前必须先翻译成本项目可读的领域名称。
- 读服务命名以 query.service.ts 结尾。
- 写服务命名以 service.ts 结尾。
- QueryService 放在 `src/modules/<bounded-context>/queries/` 目录。
- 共享能力统一放在 `src/modules/common/<capability>/` 或 `src/modules/common/*.ts`。
- 不要把业务域目录直接作为 `common` 的子目录或别名镜像。
- 涉及多进程运行时按进程职责拆分模块。
- API 入队能力与 worker 消费能力必须拆分为独立模块。
