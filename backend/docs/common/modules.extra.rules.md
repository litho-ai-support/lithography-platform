<!-- docs/common/modules.extra.rules.md -->

Purpose: Define optional but recommended guardrails for modules(service) implementation patterns.
Read when: You are implementing, reviewing, or refactoring module-level pagination or same-domain transaction-context participation.
Do not read when: Your task does not change optional modules(service) practice boundaries.
Source of truth: This file defines modules(service) supplementary rules; code examples elsewhere must not override it.

# Modules(service) 补充说明

本说明用于记录 modules(service) 的可选能力与实践约定。
属于补充指引，默认不改变层级所有权。
仅在涉及对应主题时补充实践约束。

## 统一分页服务

- 统一使用 PaginationService。
  负责排序白名单、默认排序、游标与页大小约束。
- 领域 service 只提供参数与查询上下文，不重复分页逻辑。

## 事务上下文参与能力

- modules(service) 可以接收 usecase 传入的 transaction context。
- modules(service) 可以基于该事务上下文执行同事务内细粒度写入。
- modules(service) 不得提供通用 `runTransaction`、`withTransaction` 或等价事务入口。
- 已迁移的 service 级事务入口不得恢复，不得新增调用点。
- 跨 bounded context 或跨聚合事务必须由 usecase 持有事务边界。

## Service 职责声明

- 建议在 service 注释中明确包含与不包含的职责范围。
  用于防止越界。

## Entity 来源约定

- Entity 以数据库结构为准。
- 可由 DDL 驱动生成。
- 可由工具生成后人工校核。
- 无论来源如何，最终需通过评审或校验。
- 字段、索引、关系必须保持一致。
