<!-- docs/api/adapters.rules.md -->

Purpose: Define protocol adaptation guardrails for API adapters.
Read when: You are implementing, reviewing, or refactoring GraphQL/HTTP adapter entry logic.
Do not read when: Your task does not change adapter protocol boundaries.
Source of truth: This file defines adapter boundaries; code examples elsewhere must not override it.
Global error contract: Every GraphQL interface must also follow docs/api/graphql-error-contract-current.md.

# Adapter 说明

## 定位与职责

- Adapter 作为入口适配层。
  只做输入解析、权限接入与输出封装。
- Adapter 负责协议转换。
  将外部协议输入转换为用例参数。
- 将用例结果转换为 API 输出。

## 允许内容

- GraphQL / HTTP 的 Resolver、Controller、DTO、输入校验与装饰器。
- 入参解析、输出结构映射与错误码透传。
  包括 DomainError 的错误码透传。
- 权限守卫与身份注入。
  包括 Guard、Decorator。
- Schema 初始化与枚举、标量注册，统一通过 schema.init.ts。
- Adapter module 级 DI wiring。
  仅用于把运行时配置归一化后注入 Guard / Strategy 所需的 options token。

## 禁止内容

- 直接依赖 modules(service) 或 infrastructure 的运行时值。
- 在 Resolver、Guard、Strategy、DTO 等执行类中直接读取 `ConfigService` 或 `process.env`。
- 在 Adapter 中实现业务规则、事务或跨域编排。
- 返回 ORM Entity 或 QueryBuilder 给上层调用者。
- 在 DTO 或 Resolver 中注册副作用。
- 把 GraphQL / HTTP decorator 写到 ORM Entity 上。
- 直接复用 ORM Entity 作为 GraphQL DTO / ObjectType / InputType。

## 依赖方向

- 允许 adapters → usecases。
- 允许 adapters 仅以 `import type` 引用其所调用 Usecase 相邻的 `*.types.ts`，用于该调用的输入、结果或流程契约。
  不得从 `*.usecase.ts` 实现文件借类型，也不得把该例外扩张成 adapter 对 usecase helper 或内部实现的依赖。
- 允许 adapters → core 的纯 policy、value object、DomainError、常量、normalize helper 与类型契约。
  该依赖只用于协议校验、错误映射和输入输出适配，不允许把业务编排或 I/O 下沉到 adapter。
  对输入而言，Adapter 只能执行与协议一致的纯解析/校验；场景 business policy 的选择和执行
  仍归 Usecase，不得以“纯 policy”为由前移。
- 允许 adapters 对 `src/types` / `@app-types/*` 做正常依赖，包括 GraphQL DTO 装饰器、
  `class-validator` 和 schema registry 所需的 enum 运行时值。
- 允许 adapters 仅以 `import type` 复用同域
  `src/modules/<bounded-context>/<bounded-context>.types.ts` 的稳定 View / contract。
  该例外只用于类型注解，不得引入运行时值、service、QueryService、Entity 或局部
  `queries/*.types.ts`。
- 禁止 adapters → modules(service) / infrastructure 的运行时或值依赖。
- 禁止任意层 → adapters。

## 设计原则

- 输入输出最小化。
  仅做协议适配与参数组装。
- 业务含义统一由 usecases 和 QueryService 表达。

## 结构与命名

- 按 bounded context 划分目录结构，保持与 usecases 一致。
- DTO 与 Resolver 放在同一语义目录内，避免跨域引用。
- 一个 I/O 一个文件。
- 按语义拆分 DTO、Args、List、Input、Result。
- 文件命名以语义与 GraphQL 结构类型为主。
- 避免混杂多种输入输出。

## DTO 语义规范

- DTO：adapter-owned 的协议输入输出 shape，不是领域 View、ReadModel、Record snapshot 或
  Usecase Result 的真源。Adapter 可把这些下层稳定结果薄映射为 DTO。
  例如 UserInfoDTO、AccountResponse。
- Input：写入或筛选输入。
  例如 CreateAccountInput、UpdateAccountInput。
- Args：查询或调用参数。
  例如 AccountArgs、AccountsArgs。
- List：列表与分页响应。
  例如 AccountsListResponse、UsersListResponse。
- Result：可指 GraphQL / HTTP 的 adapter transport Result，也可指 usecase-owned 流程 Result；
  归属由所在层和是否携带协议细节决定，不能仅凭后缀判断。

## GraphQL Schema 组织

- Schema 初始化只在 schema.init.ts 做一次。
- 重复调用只警告，不重复注册。
- 枚举与标量集中注册。
- 避免分散在 DTO 或 Resolver 文件中。
- 领域 enum 的 GraphQL 暴露使用 canonical source，不在 adapter DTO 中维护同义副本。
  若 DTO 装饰器、`@IsEnum` 或 `enum.registry.ts` 需要运行时 enum 值，该值应来自
  `@app-types/*` 或 adapter 本层的 GraphQL 专用 enum，不能来自 module 根 `*.types.ts`。
- GraphQL 专用 enum 可以定义在 adapter 层；注册仍统一走 `enum.registry.ts`。

## 全局 GraphQL 错误契约

- 所有 GraphQL query / mutation 都必须遵守 `docs/api/graphql-error-contract-current.md`。
- 前端运行时 auth/session 分支稳定依赖 `errors[].extensions.code`。
- `errors[].extensions.code === 'UNAUTHENTICATED'` 是受保护接口会话不可用的稳定信号。
- 前端生产运行时不得依赖 `extensions.errorCode` 做 refresh / logout 分支；该字段只用于调试、测试、观测、兼容或可选展示，并可能在生产隐藏或省略。
- HTTP `401` 只作为 transport 层认证失败兜底；GraphQL 可以 HTTP `200` 携带 `errors`。
- `TOKEN_INVALID` / `TOKEN_INVALID_AFTER_REFRESH` 等旧前端判断只能作为兼容 fallback，不得成为新接口契约。

## 适配层技巧与规范

- Guard 与 Decorator 分离。
  装饰器只定义元数据。
- Guard 读取元数据执行权限校验。
- currentUser 统一从 GraphQL context 注入。
- 避免 resolver 内重复解析。
- 入参标准化用 class-transformer 与 class-validator 统一完成。
- 入参适配为用例需要的参数，适配层不做业务规则判断。
- Adapter 负责最终协议输出形态的映射。
  包括 GraphQL ObjectType / HTTP Response shape。
- 仅做 View / ReadModel 到 DTO 的薄映射或字段直通。
- 认证错误统一走错误映射与错误码。
- GraphQL DTO 必须独立于 ORM Entity。
- ORM Entity 不得 import adapter 层或 `@nestjs/graphql`。
