<!-- file: docs/common/usecase-write-flow-boundaries.rules.md -->

Purpose: Define write-flow decomposition and transaction-root guardrails for usecases.
Read when: You are designing, reviewing, or refactoring multi-entity write orchestration in usecases.
Do not read when: Your task does not change write-flow boundaries or transaction ownership.
Source of truth: This file defines usecase write-flow boundaries; code examples elsewhere must not override it.
For precedence, see docs/common/rule-precedence.rules.md.
For boundary contract naming, see docs/common/boundary-contract.rules.md.

# 多实体写流程与事务根规则

## 1. 同域多实体写流程

以下条件同时满足时，允许由一个 Usecase 统一编排。

- 它们属于同一业务目标。
- 需要在同一事务内完成。
- 下游只调用细粒度 service 方法。
- 该 Usecase 仍然表达单一业务流程。
- 不得把多个独立流程临时拼接到一个 Usecase。

## 2. 多个独立写语义

如果流程中包含多个独立写语义，应拆分为多个 Usecase。
再由上层 Flow Usecase 统一编排。

常见判断信号：

- 任一步骤可单独复用。
- 任一步骤本身已可独立命名。
- 任一步骤未来可能被不同入口复用。
- 任一步骤失败后需要单独补偿、重试或审计。

## 3. 跨 bounded context 读取

跨域读取不能直接在 adapters 或 modules(service) 中完成。
必须提升到上层 Usecase。
并通过被读域的 QueryService 获取只读结果。

## 4. 跨 bounded context 写入

跨域写入不得下沉到 modules(service)。
必须由上层 Usecase 显式编排。

若涉及多个事务边界或外部系统，必须明确：

- 是否要求强一致。
- 是否接受最终一致。
- 是否需要补偿。
- 是否需要失败记录或后续重试入口。

## 5. Transaction Root

Transaction Root 是写流程中负责开启事务边界的入口。
本仓库中 Transaction Root 必须归属 usecase 或 usecase 注入的 transaction boundary
contract。

当前固定 transaction boundary contract 命名为 `TransactionRunner`。
不新增并行 `TransactionPort`、`UnitOfWork` 或其他事务 alias。

硬性规则：

- usecase 持有事务边界。
- usecase 在事务回调中把同一个 `PersistenceTransactionContext` 显式传给下游参与方。
- usecase-local 事务参数统一命名为 `transactionContext`，类型使用
  `@app-types/common/transaction.types` 导出的 `PersistenceTransactionContext`。
- 下游参与方包括 modules(service)、repository wrapper、QueryService 的事务内只读方法。
- Transaction boundary contract 是 usecase-owned boundary contract，不是独立分层。
- Transaction boundary contract 主要供 usecase 层注入、持有与发起。
- modules(service) 不得直接依赖 transaction boundary contract。
  当前包括 `TransactionRunner`；历史或讨论名如 `TransactionPort`、`UnitOfWork` 也不得新增或依赖。
- usecase 不得为了声明事务上下文类型而 import modules service / QueryService 实现文件，
  也不得从 bounded context 根 `*.types.ts` 继续引入并行事务 alias。
- modules(service) 不得提供全局事务入口。
- modules(service) 不得为了跨聚合或跨 bounded context 写入开启事务。
- 业务 service 上的 `runTransaction`、`withTransaction`、`transaction` 等方法不得作为新写流程入口。
- 已迁移的 service 级事务入口不得恢复，不得新增调用点。
- account 行锁若仍需复用，应由 usecase 先开启事务，再显式调用
  `lockByIdForUpdate(accountId, transactionContext)` 这类域内锁方法。
  不应继续通过 `runInLockedAccountTransaction()` 之类的包装入口获取事务能力。
- ESLint 会阻止 usecase 直接调用事务上下文的 ORM API。
  包括 `getRepository`、`createQueryBuilder`、`save`、`insert`、`update`、`delete`、
  `query`。
  usecase 可以接收和传递 `PersistenceTransactionContext`，但实际 ORM 操作应下沉到
  modules service / QueryService / repository 封装。

## 6. Account / Verification 当前稳定口径

- account 写 usecase 是 account / userInfo 写流程的事务持有者。
- registration 主流程由 usecase 持有事务边界。
- verification 主流程由 usecase 持有事务边界。
- `AccountService.runTransaction()`、`VerificationRecordService.runTransaction()` 与其他 service 级事务入口已迁移到
  `TransactionRunner` 口径。
- 新写流程不得在业务 service 上恢复通用事务入口。

## 7. QueryService 的角色

QueryService 只负责：

- 读侧读取。
- 细粒度可见性判断。
- 输出规范化。

QueryService 不负责：

- 写流程编排。
- 事务组织。
- 跨步骤业务决策。
