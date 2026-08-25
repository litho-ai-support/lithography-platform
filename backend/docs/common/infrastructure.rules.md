<!-- docs/common/infrastructure.rules.md -->

Purpose: Define external dependency and runtime implementation guardrails for infrastructure.
Read when: You are implementing, reviewing, or refactoring database, SDK, queue, or runtime adapters.
Do not read when: Your task does not change infrastructure layer boundaries.
Source of truth: This file defines infrastructure rules; code examples elsewhere must not override it.
For boundary contract naming, see docs/common/boundary-contract.rules.md.

# Infrastructure 说明

## 定位与职责

- Infrastructure 承接外部依赖与框架实现。
- Infrastructure 仅包含 I/O 与运行时实现。
- 可实现 core-owned、usecase-owned 或 module-owned boundary contract，不承载业务编排。

## 允许内容

- ORM 与数据库连接、仓储实现、查询优化。
- 外部系统接入。
  例如消息队列、邮件、短信、第三方 SDK。
- GraphQL / HTTP / RPC 运行时配置与基础设施初始化。
- 日志、监控、链路追踪、加密、序列化等技术能力适配。

## 禁止内容

- 业务用例编排与领域规则。
- 直接被 adapters 或 usecases import。
- 将 ORM Entity 暴露到 adapters。
- 将 ORM Entity 返回给上层。
- 在 ORM Entity 中混入 GraphQL / HTTP / Swagger / adapter decorator。
- 跨领域数据组装与权限判断。

## 依赖方向

- 允许 infrastructure 依赖其实现的 core-owned、usecase-owned 或 module-owned boundary contract。
- infrastructure 实现上层 boundary contract 时，只能 import 对应 contract / token / 最小共享类型。
- 禁止 infrastructure import usecase 实现文件、usecase module、业务 service、QueryService 或 ORM Entity 作为协作对象。
- 禁止 usecases 依赖 infrastructure。
- 禁止 adapters 依赖 infrastructure。

## 设计原则

- 围绕被实现的 boundary contract 提供适配，避免业务渗透。
- Boundary contract 是所属层的依赖边界模式，不是 infrastructure 之上的独立层。
- Port 只作为架构讨论术语出现；新增边界文件使用 `*.contract.ts`。
- Infrastructure 内部的 runtime contract 不是 layer boundary contract。
  例如 BullMQ job payload / result contract、payload validator、queue registry 只描述运行时传输 schema。
  它们不得作为 adapters / usecases / modules 复用业务类型的权威来源。
- Infrastructure runtime contract 文件不得使用 `*.contract.ts` 后缀；优先使用 `*.runtime.ts`、
  `*.payload.ts` 或 `*.registry.ts`，避免和 layer boundary contract 混淆。
- 细粒度、可替换、可测试的技术实现。
- 保持实现可观测性与可恢复性。
- Infrastructure 中的实现只依赖被实现的 boundary contract、必要的纯类型与底层技术组件。
- 禁止 infrastructure 反向 import modules(service) 的 service、QueryService、entity 或非 boundary-contract 局部类型。
- 若某个 infrastructure 实现需要上层协作型依赖，contract 应归属于实际拥有该协作需求的层。
  只有纯领域能力才下沉到 core；provider 绑定放回 modules(service) 或对应装配模块。
- ESLint 将 usecase-owned `*.contract.ts` 建模为独立 boundary element，并通过
  `no-infrastructure-to-usecases-imports` 阻止 infrastructure 导入其他 usecase 文件。
- “实际实现或 DI wiring”仍需 code review 根据 provider 绑定确认；文件后缀通过 lint 只证明
  import surface 合法，不自动证明该 infrastructure 文件确实承担实现或装配职责。

## 命名与结构

- 按外部系统或技术领域划分目录。
- 一个 boundary contract 可对应一个或多个 infrastructure 实现，命名与被实现的能力一致。
- Infrastructure 内部 runtime contract 可放在技术目录下的 `contracts/` 子目录，但文件名必须表达
  runtime / payload / registry 语义，不使用 boundary contract 的 `*.contract.ts` 后缀。
