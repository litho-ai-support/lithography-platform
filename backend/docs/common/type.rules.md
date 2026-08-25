<!-- file: docs/common/type.rules.md -->

Purpose: Define placement, reuse, and evolution guardrails for TypeScript type and enum definitions.
Read when: You are adding, reviewing, or refactoring shared types, enums, or GraphQL-related type placement.
Do not read when: Your task does not change type ownership or type dependency boundaries.
Source of truth: This file defines type management rules; code examples elsewhere must not override it.
For precedence, see docs/common/rule-precedence.rules.md.
For layer-owned boundary contract naming, see docs/common/boundary-contract.rules.md.

# Type 管理规则（NestJS + TypeScript + GraphQL）

本文用于统一 `src` 内 TypeScript type / enum / GraphQL type 的放置、复用与演进规则。
目标是降低分叉与重复定义。

## 1. 目标与原则

- 单一真源。
  同一业务语义只允许一个权威定义。
- 就近优先。
  默认 colocate（和 usecase / resolver / service 放一起）。
- 稳定上收。
  稳定且跨域复用的类型才进入 `src/types`。
  同域多层共享但未跨域的稳定类型放在 bounded context 根类型文件。
  例外：需要被 GraphQL DTO / schema registry 作为运行时 enum 值使用的领域 enum，若不是
  GraphQL 专用展示 enum，应放入 framework-free 的 `src/types`，因为 adapter 不能对 module 根
  `*.types.ts` 做值导入。
- 分层一致。
  type 的依赖方向必须服从项目分层规则。
- 先可演进后抽象。
  禁止“提前抽象”造成全局污染。

## 2. 四层类型模型

### L1：全局共享类型（`src/types`）

默认适用条件（必须同时满足）：

- 跨 2 个及以上 bounded context 复用。
- 语义稳定。
  未来 2~3 个迭代不会频繁改字段。
- 不含 adapter 细节。
  例如 GraphQL 装饰器、HTTP 协议字段。

补充适用条件：

- 领域 enum 虽然当前只属于单个 bounded context，但 GraphQL DTO / schema registry 需要以运行时
  enum 值引用，且 adapter 不能从 module 根 `*.types.ts` 值导入时，也归入 `src/types`。

典型内容：

- 领域 enum。
  如账户状态、身份、验证记录类型。
- 需要由 GraphQL adapter 运行时注册或装饰器引用的 framework-free 领域 enum。
- 跨层输入输出契约。
  不绑定框架。
- 通用响应结构与安全可复用类型。

### L2：bounded context 公共类型（`src/modules/<bounded-context>/<bounded-context>.types.ts`）

适用条件（必须同时满足）：

- 归属于单个 bounded context。
- 在同域的 adapter / usecase / modules 间共享。
- 语义相对稳定。
- 不值得上收到 `src/types`。

典型内容：

- QueryService 对外输出的稳定 View。
- 同域会话快照、查询契约、只读结果模型。
- 需要由 resolver、usecase、query service 共同消费的领域内 contract。

### L3：领域内局部类型（usecases / modules / core 内 colocate）

适用条件（命中任意一项即可）：

- 仅服务于单个业务流程。
- 字段仍在快速变化。
- 只被同一模块内少量调用方使用。

典型位置：

- `src/usecases/**/types/*.ts`
- `src/modules/**/**.types.ts`
- `src/core/**/**.types.ts`

### L4：适配层类型（GraphQL / HTTP DTO 与协议输入输出）

规则：

- 本仓库架构术语中的 `DTO` 专指 adapter-owned transport shape。下层的 View、ReadModel、
  Record snapshot、usecase Result / summary 或稳定 data shape 不称为 DTO。
- 仅放在对应 adapter 协议目录，例如 `src/adapters/api/graphql/**/dto` 或
  `src/adapters/api/http/**` 的同层语义目录。
- 不进入 `src/types`。
- 不作为领域模型向下游传播。
- 不与 ORM Entity 合并。
- GraphQL decorator 只能出现在 adapter 层 DTO / Args / Input / Result 类型中。
- `Input` / `Result` 词本身不是 adapter 专属：framework-free 的 usecase-owned Input / flow
  Result 可以留在 usecase；只有 adapter 协议 shape 或携带协议 decorator 的 Input / Result
  属于本节的 adapter 类型。

典型内容：

- `@ObjectType` / `@InputType` class。
- GraphQL union / result type。
- 仅前端展示相关字段组合。

## 3. enum 管理规则

### 3.1 领域 enum

- 跨 bounded context 复用，或需要由 GraphQL DTO / schema registry 作为运行时值使用的领域 enum，
  canonical source 必须放在 framework-free 的 `src/types`。
- 只有完全属于 Core 内部纯领域规则、不需要被 adapter 作为运行时值引用、也不作为跨域共享契约的
  enum，才可放在 `core`。
- 仅在同一 bounded context 内共享且不需要 GraphQL runtime 引用的 enum，按 L2/L3 规则留在
  bounded context 根类型文件或领域内局部位置。
- 在 GraphQL 侧通过集中注册暴露。
- 同一 bounded context 内共享、但需要 GraphQL DTO 或 `enum.registry.ts` 以运行时值引用的领域
  enum，也应放在 `src/types` 并通过 `@app-types/*` 导入。
  不要为了 GraphQL 暴露在 adapter 层维护同义 `Gql*` 副本，也不要让 adapter 对
  `src/modules/<bounded-context>/<bounded-context>.types.ts` 做值导入。
- 若 module 内代码希望继续从 bounded context 根类型入口使用该 enum，该根类型文件可以从
  `@app-types/*` re-export；canonical source 仍是 `src/types`。
- 禁止在业务目录分散注册。

### 3.2 GraphQL 专用 enum

- 仅 GraphQL 展示语义的 enum 保留在 adapter 层。
  如分页模式。
- 统一在 `src/adapters/api/graphql/schema/enum.registry.ts` 注册。
- GraphQL 专用 enum 只表达协议展示语义，不得复制已有领域 enum 的业务值域。

### 3.3 禁止项

- 禁止同语义 enum 在多个目录重复定义。
- 禁止“名字相同但值域不同”的隐式冲突。
- 禁止在 resolver 内临时定义可复用 enum。

## 4. import 与依赖方向（类型同样受限）

- adapters 可对 usecases / core / `src/types` 建立正常依赖；
  adapter 为调用某个 Usecase，可从该 Usecase 相邻的 `*.types.ts` 仅作 type-only 导入；
  该流程契约不因此成为 bounded-context 公共类型，也不得从 `*.usecase.ts` 实现文件导入。
  对同域 `src/modules/<bounded-context>/<bounded-context>.types.ts` 只允许下述 type-only 复用。
- usecases 可依赖 modules(service) / core / `src/types`。
- modules(service) 可依赖 infrastructure / core / `src/types`。
- core 禁止依赖 adapters / usecases / framework 细节。
- 任何层禁止反向依赖 adapters。
- L1 共享类型统一通过 `@app-types/*` 引用。
- 禁止使用 `@src/types/*` 混用入口。
- 同域多层共享但未跨域的稳定类型，统一放在 `src/modules/<bounded-context>/<bounded-context>.types.ts`。
- 仅由一个 Usecase 与其调用 adapter 共享的执行输入 / 结果，留在 Usecase 相邻 `*.types.ts`；
  当它成为多个 Usecase、modules(service) 或整个 bounded context 的稳定公共契约时，才提升到 bounded context 根类型文件。
- 同域上游（含 adapters / usecases）若需复用该类类型，只允许 `import type` 或纯类型 import
  此 bounded context 根公共类型文件；该规则不允许 adapters import modules 的 service、
  QueryService、Entity、局部 `queries/*.types.ts`，也不允许任何值导入。
- adapters 若需要 enum 运行时值用于 `@Field(() => Enum)`、`@IsEnum(Enum)` 或
  `registerEnumType(Enum)`，该 enum 的 canonical source 必须是 adapter 允许值导入的位置，
  优先使用 `@app-types/*` 的 `src/types`。不得从 module 根 `*.types.ts` 值导入。
- 禁止为了复用类型跨层 import 下层实现文件。
  例如 adapters 不得从 modules 的 `*.service.ts`、`*.query.service.ts`、局部 `queries/*.types.ts` 借类型。
- 禁止 usecase 为声明事务上下文类型而从 modules service / QueryService 实现文件、
  bounded context 根 `*.types.ts` 或历史 transaction alias 文件借类型。
- `PersistenceTransactionContext` 是跨 bounded context 的稳定纯类型，真源是
  `src/types/common/transaction.types.ts`。
  该类型使用 `unique symbol` brand，不导入 TypeORM、Nest、core、infrastructure 或
  adapter 类型，也不暴露可供 usecase 操作的运行时字段。
- 禁止把 infrastructure runtime contract 当作上层业务类型来源。
  例如 BullMQ payload contract、validator registry、第三方 SDK 响应类型不得直接成为 adapters /
  usecases / modules 的共享输入输出类型真源。
- 跨域稳定共享的 View / contract type 才进入 `src/types`。
- 同域稳定共享的 View / contract type 留在所属 bounded context 根类型文件。
- Boundary contract 不属于本文件的 `*.types.ts` 数据类型收口范围。
  它们按 `docs/common/boundary-contract.rules.md` 归属到 owning layer，并使用
  `*.contract.ts`。
- 不新增多个并行 `EntityManager` alias。
  尤其不得新增或恢复 `AccountTransactionManager`、
  `VerificationRecordTransactionManager`、`*TransactionManager = EntityManager` 这类
  给上层借用的事务类型。
- ESLint 会阻止 usecases / modules 中新增 `*TransactionManager` alias。
  不得恢复旧 `TransactionManager` 兼容类型。
- 局部流程类型继续 colocate 在本层，不向上层暴露实现位置。

说明：type 文件不因为“只是类型”而豁免依赖方向。

## 5. `src/types` 入库门槛（Checklist）

新增类型前必须通过以下检查。

- 是否含 GraphQL / HTTP / ORM 细节。
  若是，禁止入 `src/types`。
- 是否稳定。
  若否，放本地 colocate。
- 是否是 GraphQL-exposed 领域 enum，且 adapter 需要运行时值。
  若是，放 `src/types`，保持 framework-free，并通过 `@app-types/*` 使用。
- 是否跨域复用。
  若是，放 `src/types`。
- 是否只是同域多层共享。
  若是，放 `src/modules/<bounded-context>/<bounded-context>.types.ts`。
- 是否已有同义类型。
  若是，先合并再新增。
- 是否会引入反向依赖。
  若是，禁止入库。
- 是否只是为了复用类型而让上层 import 下层实现文件。
  若是，应改为上收到 `src/types`、提升到 bounded context 根类型文件，或留在本层局部使用。

满足“跨域稳定共享”或“GraphQL runtime 领域 enum 例外”，且不违反 framework-free /
依赖方向约束时，才可进入 `src/types`。

## 6. 命名与文件组织

- 文件名统一 `*.types.ts`。
  已约定的 `*.enum.ts` 除外。
- enum 命名优先业务语义名。
- 类型命名优先本项目稳定领域语义。
  外部系统、协议、存储、UI 控件、SDK 或历史实现的偶然语义不得直接成为共享/业务类型真源名称；
  需要保留时应限制在 raw / adapter / infrastructure 边界内。
- 避免 `Common` / `Base` 等泛名。
- 输入参数优先对象参数。
  单一简单值除外。
- 同一目录内命名风格保持一致。
- 不混用缩写与全称。

## 7. 错误码类型约定

- 业务错误码单一真源：`src/core/common/errors/domain-error.ts`。
- 对外错误响应 payload / view 默认 colocate 在 adapter 或 infrastructure。
  仅当其跨多个 adapter 稳定复用且不依赖 `core` 语义时，才允许进入 `src/types`。
- `src/types` 禁止依赖 `src/core`，错误响应结构也不例外。
- 禁止维护第二套并行业务错误码集合。

## 8. 迁移策略（增量，不大爆炸）

- Step 1：先标注重复类型与冲突点。
  尤其是 enum。
- Step 2：确定 canonical source。
  保留一份权威定义。
- Step 3：批量替换 import。
  引入兼容导出过渡。
- Step 4：移除旧定义。
  补充最小回归测试。
- Step 5：在 Code Review 中启用本规则作为检查项。

## 9. Code Review 必查项（简版）

- 新增 type 是否遵循 L1 / L2 / L3 / L4 归位。
- 是否出现重复语义定义。
- 是否把 adapter DTO 泄漏到 usecase / core。
- 是否把 adapter decorator 写入 ORM Entity。
- enum 是否统一注册。
- import 方向是否满足分层约束。

## 10. 适用于当前仓库的落地建议

- 优先清理重复排序 enum。
  保留单一来源。
- 将同域共享的稳定 View / contract 收敛到 bounded context 根 `*.types.ts`。
- 将需要 GraphQL runtime 使用的领域 enum 收敛到 `src/types`；module 根类型文件如需保留入口，
  只做 re-export，不维护第二份 enum。
- 保持 GraphQL 枚举集中注册。
- 不在 resolver 分散注册。
- 将 type 选址规则纳入 PR 模板与团队约定。
