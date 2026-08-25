Purpose: Define first-release schema baseline and empty-database migration delivery guardrails.
Read when: You are creating, reviewing, or validating baseline migration delivery and empty-db drills.
Do not read when: Your task does not change baseline migration delivery boundaries.
Source of truth: This file defines baseline delivery rules; code examples elsewhere must not override it.

  # Database Baseline Delivery Rules

  ## 目的

  在项目仍处于“首次建库 / 基线收敛”阶段时，统一数据库结构交付方式。
  避免把“baseline 建库”与“增量迁移演进”混为一谈。

  本规则用于约束以下事实：

  - `entity` 表达当前代码认可的数据库最终形态
  - `migration baseline` 表达首次建库时应落下的数据库最终形态
  - `e2e` 通过 `synchronize` 验证 `entity` 自洽
  - 部署前通过一次“空库执行 migration”验证 baseline 可实际建库

  ## 适用范围

  本规则适用于当前项目的数据库基线阶段，即：

  - 正式环境数据库尚未进入长期、连续的增量迁移治理
  - migration 当前主要承担“空库建表”职责
  - e2e 仍以 `entity + synchronize` 为主进行结构验证

  本规则不适用于“已有线上存量库的持续版本升级”阶段。

  ## 核心定义

  ### 1. Entity

  `entity` 是当前代码中的数据库最终形态定义。

  它用于：

  - 约束运行时 ORM 行为
  - 支撑本地开发与 e2e 的 `synchronize`
  - 作为当前代码所认可的 schema 真相来源

  ### 2. Migration Baseline

  `migration baseline` 是“空库初始化时应被创建出的数据库最终形态”。

  它用于：

  - 首次部署前的自动建库
  - 新环境、空数据库的结构初始化
  - 对当前认可 schema 的显式、可执行表达

  ### 3. E2E Sync Verification

  当前阶段，e2e 使用 `entity + synchronize` 验证：

  - entity 定义内部是否自洽
  - 代码、ORM、测试数据清理逻辑能否协同工作
  - 当前业务流程是否能在最终 schema 形态下正常运行

  ### 4. Empty-DB Migration Verification

  部署前，必须在空库上实际执行一次 migration，用于验证：

  - baseline migration 可执行
  - migration 顺序正确
  - 外键、索引、默认值、时间字段等 DDL 可落地
  - 不能只凭 e2e 成功来推断 migration 一定可用

  ## 当前阶段的闭合逻辑

  当前项目采用如下闭合逻辑：

  - `entity` 是最终形态
  - `migration baseline` 也是最终形态
  - `e2e` 用 `sync` 验证 `entity` 是否自洽
  - 部署前再用一次空库 migration 验证 baseline 是否能建出来

  在此模式下，只要规则被持续遵守，schema 交付链路是闭合的。

  ## 强制规则

  ### Rule 1. Migration 当前仅作为 baseline 建库脚本使用

  当前阶段的 migration 只承担以下职责。

  - 在空库中创建当前认可的最终 schema
  - 为首次部署前的建库流程提供可执行脚本

  当前阶段不要求 migration 还原完整历史演进过程。
  也不要求按历史提交逐条补齐旧时代 schema 变化。

  ### Rule 2. Entity 与 Baseline Migration 必须同步维护

  只要 schema 发生变化，必须同时更新：

  - 对应 `entity`
  - 对应 baseline migration

  禁止出现以下情况：

  - 只改 entity，不改 migration
  - 只改 migration，不改 entity
  - 用“e2e 能过”替代 migration 同步更新
  - 用“migration 能建库”替代 entity 对齐

  ### Rule 3. E2E 通过不等于 Migration 可用

  e2e 当前只证明：

  - entity 结构可被 ORM 正常使用
  - 当前代码路径与测试路径在 sync 模式下工作正常

  e2e 不直接证明：

  - migration 顺序一定正确
  - 空库执行 migration 一定成功
  - migration DDL 与真实目标 schema 完全一致

  因此，部署前必须单独执行一次空库 migration 验证。

  ### Rule 4. 首次部署前必须执行空库 Migration 验证

  在第一次正式部署前，必须执行一次独立验证流程。
  至少包括：

  1. 创建空数据库
  2. 执行全部 baseline migrations
  3. 验证关键表、关键索引、关键外键存在
  4. 失败即阻断部署

  禁止只依赖 e2e 结果推断“应该可以建库”。

  ### Rule 5. Sync 只允许用于开发 / E2E 阶段

  `DB_SYNCHRONIZE=true` 仅允许用于：

  - 本地开发
  - e2e 测试环境
  - 明确声明的示例模块或临时验证环境

  正式环境、预发环境、部署建库流程不得依赖 `synchronize` 直接改库。

  ### Rule 6. Table Name 统一使用单数

  数据库表名统一使用单数 snake_case。

  适用范围：

  - `@Entity('<table_name>')`
  - baseline migration 中的 `CREATE TABLE`
  - 外键、唯一索引、普通索引、raw SQL、空库校验脚本中的表名引用
  - 文档中描述物理表名的地方

  规则：

  - 新增表必须使用单数表名。
  - 修改已有 schema 时，应优先把复数表名收敛为单数表名。
  - 复数表名属于历史命名债务，不得作为新表命名模板。
  - 若当前任务不是数据库命名收口，不应顺手重命名既有表。
  - 表名重命名必须同时更新 entity、baseline migration、索引/外键引用、raw SQL、空库校验和相关测试。

  当前项目已完成既有复数表名收口。
  若后续发现遗漏的复数物理表名，应作为数据库命名治理缺陷处理，并同步更新完整 schema 引用链路。

  ## 推荐工作流

  ### 日常开发

  1. 修改 entity
  2. 同步修改 baseline migration
  3. 本地通过 `synchronize` 跑通开发和 e2e
  4. 确认 schema 行为与业务一致

  ### 首次部署前

  1. 创建空数据库
  2. 执行 baseline migrations
  3. 验证关键表、关键索引、关键外键
  4. 再执行应用启动或测试验证

  #### 命令示例（空库 migration 演练 / 首次建表）

  使用项目脚本：

  ```bash
  npm run migration:drill:empty-db
  ```

  默认会使用当前环境中的 `DB_NAME` 作为演练库，并先清空该库再执行 baseline migrations。
  如需覆盖目标数据库（用于首次建表），使用：

  ```bash
  MIGRATION_DRILL_DATABASE=<目标数据库名> MIGRATION_DRILL_ALLOW_NON_TEST_DB=true npm run migration:drill:empty-db
  ```

  如确需使用临时库进行可回收演练，且账号具备全局建库/删库权限，使用：

  ```bash
  MIGRATION_DRILL_CREATE_TEMP_DB=true npm run migration:drill:empty-db
  ```

  说明：

  - 脚本内部固定 `synchronize=false`。
  - 不会因为 e2e 环境里的 `DB_SYNCHRONIZE=true` 而改写验证语义。
  - 未指定 `MIGRATION_DRILL_DATABASE` 时，脚本默认使用 `DB_NAME`。
  - 目标库会被先清空再执行 baseline migrations，适合“首次建表交付”或受限权限演练。
  - 只有显式设置 `MIGRATION_DRILL_CREATE_TEMP_DB=true` 时，脚本才会创建临时库并在结束后清理。
  - 临时库方式更适合“可回收演练”，但要求账号具备全局 `CREATE/DROP DATABASE` 权限。
  - 若数据库名已包含 `test/drill/ci`，可不传 `MIGRATION_DRILL_ALLOW_NON_TEST_DB=true`。

  ## 非目标

  当前阶段，本规则不解决以下问题：

  - 存量线上数据库的增量升级路径
  - 历史 migration 的完整追溯
  - 旧版本到新版本的多跳升级兼容性
  - migration 回滚策略的完备性

  这些问题属于“进入增量 migration 治理阶段”后的新规则范围。

  ## 进入下一阶段的触发条件

  当项目出现以下任一情况时，应停止仅以 baseline 方式维护 migration。
  并切换到增量 migration 治理模式：

  - 线上数据库已存在真实业务数据
  - 新版本需要在旧库上直接升级
  - schema 变更需要版本化发布
  - 不再是“空库首次建库”，而是“存量库持续演进”

  切换后，应新增专门规则，约束：

  - 增量 migration 的编写方式
  - migration 与 e2e 的验证方式
  - 回滚策略
  - 线上升级顺序

  ## 结论

  当前阶段允许采用以下策略：

  - `entity` 作为最终形态
  - `baseline migration` 作为空库建库脚本
  - `e2e` 继续使用 `sync`
  - 首次部署前通过一次空库 migration 验证 baseline 可执行

  在满足上述规则的前提下，这是一套可接受、闭合且工程成本较低的过渡方案。
