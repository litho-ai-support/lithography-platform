<!-- docs/common/core.rules.md -->

Purpose: Define pure domain, value object, and core-owned boundary contract guardrails for core.
Read when: You are implementing, reviewing, or refactoring domain models, value objects, or core-owned boundary contracts.
Do not read when: Your task does not change core layer boundaries.
Source of truth: This file defines core rules; code examples elsewhere must not override it.
For boundary contract naming, see docs/common/boundary-contract.rules.md.

# Core 说明

## 定位与职责

- Core 只承载领域模型、值对象、领域规则与 core-owned boundary contract。
- Core 是系统中最稳定、最少变动的层，负责表达业务不变性。
- Core 不关心运行时环境与框架，保持纯粹与可移植性。

## 允许内容

- 领域模型与值对象。
  允许不可变或受控变更。
- 领域规则与纯函数。
  要求确定性、无副作用。
- Core-owned boundary contract。
  仅用于纯领域能力所需的外部依赖边界。
  由 infrastructure 提供实现。
- 领域错误码、错误映射表与业务枚举。

## 禁止内容

- 任何框架代码。
  例如 NestJS、GraphQL、Express、TypeORM。
- 任何 I/O 与外部依赖。
  例如数据库、HTTP、消息队列、缓存、文件系统。
- 读取配置、环境变量或注入 ConfigService。
- 运行时注册。
  包括全局中间件、过滤器、装饰器副作用。
- 依赖注入相关标记。
  例如 Module、Injectable、Provider。

## 依赖方向

- 允许 usecases、modules(service)、infrastructure 依赖 core。
- 禁止 core 依赖任何上游层。
  包括 adapters、usecases、modules、infrastructure。
- core 只能依赖 core-local 代码。
- 当当前 docs 和 lint 允许时，core 可依赖 `@app-types/*` 中稳定、框架无关的共享类型。

## 设计原则

- 领域规则优先，技术细节后置。
- 抽象稳定，具体实现可替换。
- Boundary contract 是某一层拥有的依赖边界模式，不是独立分层。
- 本仓库新增 boundary contract 文件默认使用 `*.contract.ts`。
  Port 只作为架构术语出现，不作为新增文件后缀。
- Core-owned boundary contract 必须表达纯领域能力，不承载 usecase 编排、事务、队列调度等运行时能力。
- 纯函数优先，最小副作用。
- 只有稳定且有生产调用点的规则才沉淀为 core policy。
- 不为了一次性流程判断或缺少重复证据的局部逻辑新增 core policy。
- 若某个纯 policy 已存在，应确保它有生产调用点和聚焦单测；否则应重新评估是否保留。
- 某个 bounded context 内部仍在演进的纯规则，可以先放在对应 module 内的
  `*.policy.ts` / `*.state.ts`。
  只要它保持纯函数、无 I/O、无 DI、无 ORM，就不违反 core 规则。
  当该规则跨场景稳定复用后，再评估是否上收到 `src/core/<domain>`。

## 当前 Account Policy 口径

- `role-access.policy.ts` 承载角色展开与角色判断。
- `user-info-visibility.policy.ts` 承载 userInfo 可见性的纯判断。
- `parse-staff-id.ts` 承载 staffId 解析的纯判断。
- Account 状态迁移、访问摘要投影、注册中间态不变量只有在出现稳定重复或明确聚合不变量证据时，才进入 `core/account`。

## Legacy 兼容口径

- 当前 `src/core/**` 中保留的共享 contract / interface 必须使用 `*.contract.ts`
  或更具体的纯类型 / helper 命名。
- Legacy contract 只能做必要维护，不得继续扩大职责、增加新的反向依赖或作为新 contract 的放置模板。
- 新增 core-owned boundary contract 使用 `*.contract.ts`，不得使用 `*.port.ts`
  / `*.ports.ts` 命名。
- 新增运行时、事务、队列、外部系统、provider、gateway 等能力边界时，先判断实际 owning layer。
  只有纯领域能力才允许新增 core-owned boundary contract。

## 命名与结构

- 领域模型命名清晰表达业务语义。
- Core-owned boundary contract 以领域能力命名，避免技术细节。
- 按领域边界组织目录，避免横切堆叠。
