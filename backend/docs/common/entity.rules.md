<!-- docs/common/entity.rules.md -->

Purpose: Define ORM Entity purity and adapter-decorator guardrails.
Read when: You are implementing, reviewing, or refactoring TypeORM entities, GraphQL DTOs, HTTP DTOs, or persistence models.
Do not read when: Your task does not touch entities, DTOs, or adapter output types.
Source of truth: This file defines Entity purity rules; examples elsewhere must not override it.

# Entity 规则

## 定位

- ORM Entity 只表达持久化结构和 ORM 映射。
- ORM Entity 不表达 API 协议。
- ORM Entity 不作为 adapter DTO。
- ORM Entity 不作为 resolver / controller 的返回类型。

## 允许内容

- TypeORM 装饰器。
- 数据库字段、索引、约束、关系映射。
- 与持久化结构直接相关的列类型。
- 数据库交付所需的最小注释。

## 禁止内容

- GraphQL 装饰器。
  例如 `@ObjectType`、`@Field`、`@InputType`、`@ArgsType`、`@InterfaceType`。
- HTTP / Swagger / OpenAPI 装饰器。
  例如 `@ApiProperty`。
- class-validator 输入校验装饰器。
- class-transformer 输出转换装饰器。
- Resolver、Controller、Guard、Interceptor、Pipe 相关装饰器。
- adapter 专用字段。
- 前端展示专用字段。
- 协议输出 shape。
- 直接 import `@nestjs/graphql`。
- 直接 import adapter 层文件。

## GraphQL DTO 放置

- GraphQL `ObjectType`、`InputType`、`ArgsType` 只能放在 `src/adapters/api/graphql/**`。
- GraphQL DTO 可以薄映射 usecase 返回的稳定 View、ReadModel、Record snapshot 或流程 Result。
- GraphQL DTO 不得向下游 usecase、modules(service)、core、infrastructure 传播。
- GraphQL enum 注册继续走 adapter schema 初始化规则。

## Entity 暴露规则

- adapters 不得返回 ORM Entity。
- usecases 对外不得返回 ORM Entity。
- QueryService 对外不得返回 ORM Entity。
- modules(service) 对上游不得返回 ORM Entity，除非调用方是同一模块内部私有 helper。
- modules / QueryService 对上游输出必须是 View、ReadModel、Record snapshot 或明确的稳定
  data shape；usecase 也可返回其流程专属 Result / summary。DTO 只由 adapter 创建。

## 迁移规则

- 新 Entity 禁止添加 adapter decorator。
- 修改已有 Entity 时，若发现 adapter decorator，必须优先迁出。
- 迁出时新建 adapter DTO，不复用 Entity class。
- 若现有 API 依赖 Entity 字段名，adapter DTO 保持对外字段兼容。
- 迁移不得改变数据库字段、索引或迁移语义，除非当前任务明确要求。
- `@Entity('<table_name>')` 的物理表名统一使用单数 snake_case。
  详细规则与历史复数表名处理口径见
  `docs/project-convention/database-baseline-delivery.rules.md`。

## Code Review 必查项

- Entity 文件是否 import 了 adapter 或 GraphQL 包。
- Entity class 是否出现非 TypeORM 装饰器。
- Resolver / Controller 是否直接返回 Entity。
- Adapter DTO 是否被下游层 import。
- View / ReadModel / Result / DTO 与 Entity 是否保持清晰分离，且 DTO 是否只存在于 adapter。
