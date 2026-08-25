<!-- docs/common/boundary-contract.rules.md -->

Purpose: Define boundary contract ownership and naming guardrails.
Read when: You are adding, moving, or reviewing an interface/token used to invert an external or runtime capability.
Do not read when: You are only changing DTO/View/data shape types; use docs/common/type.rules.md instead.
Source of truth: This file defines boundary contract naming and shared vocabulary; layer-specific rule files define ownership details.

# Boundary Contract 规则

## 术语

- Boundary contract 是某一层拥有的依赖边界模式，不是独立分层。
- Port 是架构讨论中的同类概念词，不是本仓库新增文件命名约定。
- 新增 boundary contract 文件必须使用 `*.contract.ts`。
- 不新增 `*.port.ts` / `*.ports.ts` 文件，也不建立全局 boundary contract 层或
  `ports` 层。

## 归属

- Core-owned boundary contract：只表达纯领域能力，必须框架无关。
- Usecase-owned boundary contract：表达 usecase 编排所需运行时能力。
  例如事务 runner。
- Module-owned boundary contract：只在模块需要隔离可替换 infrastructure 实现时使用。
- Infrastructure 只实现或适配 boundary contract，不拥有业务决策。

归属跟随“谁拥有需要该能力的决策”，而不是跟随实现所在位置。Infrastructure 实现或绑定
contract 不会转移该 contract 的 ownership。

Infrastructure 只有在实际实现或 DI wiring 某个上层 contract 时，才获得一个窄的依赖反转
例外：允许 import 被实现的 `*.contract.ts`、其中的 token，以及 contract 签名直接引用
的最小 framework-free 类型。该例外不允许 infrastructure import owning layer 的实现文件、
module、service、QueryService、helper、barrel 或场景局部类型。对于新增跨层边界，
`*.contract.ts` 后缀是识别 boundary contract 的必要条件，不是获得跨层访问权的充分条件；
已有 legacy interface 仅可在对应规则明确列出时维持现状，不构成新增例外。

## 命名与位置

- 文件后缀使用 `*.contract.ts`。
- 文件名以能力命名，避免技术实现细节。
- usecase 共享运行时能力放在 `src/usecases/common/ports/*.contract.ts`。
  这里的 `ports/` 是既有组织目录，不代表独立 boundary contract layer。
- 同域数据形态、View、snapshot、enum 等不属于 boundary contract。
  它们按 `docs/common/type.rules.md` 放入 `*.types.ts` 或 `src/types`。

## TransactionRunner 当前口径

- `TransactionRunner` 是 usecase-owned transaction boundary contract。
- 当前固定真源是
  `src/usecases/common/ports/transaction-runner.contract.ts`。
- `TransactionRunner.run()` 回调只传递 `PersistenceTransactionContext`。
- `PersistenceTransactionContext` 是纯共享类型，真源在
  `src/types/common/transaction.types.ts`，通过 `@app-types/common/transaction.types`
  引用。
- `PersistenceTransactionContext` 使用 `unique symbol` brand，不暴露 ORM API，也不包含
  `manager` 等运行时字段。
- usecase 只能传递 `transactionContext`，不得感知或操作 TypeORM `EntityManager`。
- modules(service) / QueryService 对外接收
  `transactionContext?: PersistenceTransactionContext`；内部可按需通过 infrastructure
  TypeORM helper 解包为 `EntityManager`。
- TypeORM 绑定实现只放在
  `src/infrastructure/database/transaction/typeorm-persistence-transaction-context.ts`；
  该 helper 内部用私有 `WeakMap<PersistenceTransactionContext, EntityManager>` 保存映射。
  usecase 不得 import 该 helper。
- 不通过新增并行 `TransactionPort`、`UnitOfWork`、
  `*TransactionManager = EntityManager` 或其他 alias 快修事务边界。

## Lint Guard

当前 ESLint 会拦截以下偏移：

- 新增或导入 `*.port.ts` / `*.ports.ts` boundary 文件。
- 导入 `transaction-runner.port`。
- 新增 `TransactionPort` / `UnitOfWork` 事务并行抽象名。
- 在 usecases / modules 中新增 `*TransactionManager` alias。
  不得恢复旧 `TransactionManager = EntityManager` 兼容类型。

当前 lint 已分别建模 module-owned 与 usecase-owned `*.contract.ts`，并阻止 infrastructure
导入 owning layer 的其他实现文件。Lint 只验证路径与后缀；contract 是否由该 infrastructure
文件实际实现或装配，仍按 `docs/common/infrastructure.rules.md` 人工审查。
