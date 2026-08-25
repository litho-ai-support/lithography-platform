<!-- 文件位置: docs/common/queryservice.rules.md -->

Purpose: Define read-side access, permission, and output-shaping guardrails for QueryService.
Read when: You are implementing, reviewing, or refactoring modules queries and read-side output shaping.
Do not read when: Your task does not change QueryService boundaries.
Source of truth: This file defines QueryService rules; code examples elsewhere must not override it.

# QueryService 说明

## 目标与定位

- QueryService 用于读侧能力收敛。
  负责读取、权限判定与读侧输出整形。
- Usecase 是 QueryService 唯一的上层调用者，禁止 adapters 直接依赖 QueryService。
- 同一 bounded context 的 QueryService 可以把另一个 QueryService 作为只读下游依赖；这种
  modules 内部组合不属于“上层调用”，必须保持单向且无环。
- 本规则中的“同一 bounded context”按物理 owner 根目录判断：即
  `src/modules/<bounded-context>/` 中 `<bounded-context>` 相同。不同子目录或不同 Nest feature
  module 不自动构成跨 bounded context。
- QueryService 的上述横向组合许可不覆盖 capability dependency 规则；capability 前置与运行时
  gate 仍必须遵守 `docs/common/capability.rules.md` 和对应 capability decision。
- QueryService 不产生副作用，不包含写入行为。
- QueryService 归属 modules(service)。
- QueryService 下游可以依赖 core、同域只读 repository、同域 ORM Entity、同域其他
  QueryService，或通过 DI 引入的 infrastructure 查询实现。
- QueryService 不依赖混合读写的普通 Service。

## 文件结构

- 通用结构：`src/modules/<bounded-context>/queries/*.query.service.ts`。
- 一个文件聚焦一类读取职责，避免跨语义混杂。

## 命名方式

- 简单读且以 Entity 为语义中心：`<entity>.query.service.ts`。
  - 示例：`verification-record.query.service.ts`
- 单一读取语义且不等于实体名：`<semantic>.query.service.ts`。
  - 示例：`consumable.query.service.ts`
- 带结果整形、读取阶段判定或登录装配等场景语义。
  以读取语义命名。
  - 示例：`login-result.query.service.ts`

## 职责分配

- 读侧输出整形。
  - QueryService 负责将内部实体或聚合读取结果转换为稳定 View、ReadModel 或 Record snapshot。
  - QueryService 不创建或返回 adapter-owned DTO；DTO 映射由 adapter 完成。
  - 对上游禁止返回 ORM Entity 或 QueryBuilder。
- 只读与权限判断。
  - 细粒度授权与读侧校验在 QueryService 内完成。
  - 包括可见性与字段裁剪。
  - 写用例的流程级授权由 Usecase 负责。
  - QueryService 不参与写侧决策。
  - 细粒度授权可抽为同域 PermissionPolicy / AccessPolicy。
  - 可实现为纯函数或 service。
  - 供 Usecase 与 QueryService 复用。
  - Usecase 可以调用 QueryService 获取只读结果。
  - QueryService 不反向调用 Usecase。
  - 跨 bounded context 读取必须提升为 usecases。
  - 同一 bounded context 内只允许 QueryService 到 QueryService 的只读组合，不得借此调用普通
    Service、写 repository 或形成跨域 modules 依赖。
- 不做事务编排与写入。
  - 写操作与事务编排由 usecases 负责。

## 依赖方向

- adapters → usecases
- usecases → modules(service) 或 core。
- modules(service) → infrastructure 或 core。
- QueryService 归属 modules(service)。
- 上层只允许 usecases 依赖；adapters 不得直接调用 QueryService。
- QueryService 下游优先依赖 `core`、同域只读 repository、同域 ORM Entity，
  或通过 DI 注入的 infrastructure 查询实现。
- QueryService 允许依赖同域的其他 QueryService。
  “同域”在此明确指同一 bounded context；依赖必须保持只读、单向且无环。
- QueryService 不应依赖混合读写的普通 Service。
  即使当前调用的方法恰好是只读方法，也不作为例外。
- 若某查询能力当前只存在于普通 Service，应优先下沉为只读 repository / 查询实现。
  或拆为独立 QueryService，而不是继续扩大 QueryService → Service 依赖。
- QueryService 产出的稳定共享 View / contract type，若只在同一 bounded context 内跨层复用，
  放在 `src/modules/<bounded-context>/<bounded-context>.types.ts`。
- 仅当该类型跨多个 bounded context 稳定复用时，才上收到 `src/types`。

## Account 读模型稳定口径

- `AccountQueryService` 是 account / userInfo 读侧视图与规范化的主要入口。
- `UserInfoView` 的 production 字段拼装应收敛到稳定 mapper，避免登录读取、严格读取、可见资料读取各维护一套默认值逻辑。
- 登录兜底读取、严格读取、可见资料读取可以是不同读取模式，但不得各自维护完整 view shape。
- `FetchUserInfoUsecase` 负责登录流程读取与安全校验，不应长期作为通用 view 字段拼装真源。
- userInfo 可见性读取应复用 core 中的纯可见性 policy，例如 `canViewUserInfo()`。
- Session authority snapshot 属于 query-side projection，不是 account 聚合实体契约。

## 拆分原则

- 单文件单语义。
- 一类事情一文件。
- 视图映射是 QueryService 基础职责。
- 不把视图映射作为拆分理由。
- 当出现多种读取语义时，考虑拆分。
- 当出现不同权限策略时，考虑拆分。
- 当出现不同输出形态时，考虑拆分。
- 若只是几个轻量方法且语义一致，不必拆分。
