  <!-- docs/human/database-first-release.zh-CN.md -->

  # 数据库首次交付与上线操作说明

  ## 文档定位

  - 本文是数据库交付的操作文档
  - 本文回答“上线时具体怎么做”
  - 设计原则、边界与约束说明，继续以 [database-baseline-delivery.rules.md](../project-convention/database-baseline-delivery.rules.md) 为准。

  ## 适用范围

  - 当前项目尚处于首次建库 / baseline migration 交付阶段。
  - 目标数据库是空库，或允许在建表前清空。
  - 本文不用于已有线上业务数据的增量升级。

  ## 交付目标

  首次发布时，数据库交付要满足以下结果：

  - 目标库结构由 baseline migrations 创建完成。
  - 运行时不依赖 `synchronize` 改库。
  - API / Worker 使用同一份已初始化完成的数据库结构启动。
  - 交付过程可重复执行，失败可中止，状态可检查。

  ## 交付前提

  执行前必须确认以下条件成立：

  - 已拿到目标环境数据库连接信息。
  - 目标数据库允许首次建表，或允许在建表前清空。
  - 已准备好生产环境使用的 `.env` 配置。
  - 已确认本次发布对应代码版本。
  - 已确认 API 与 Worker 将使用同一份 schema 版本启动。

  ## 环境变量要求

  至少应确认以下变量已正确配置：

  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASS`
  - `DB_NAME`
  - `DB_TIMEZONE`
  - `DB_SYNCHRONIZE`
  - `DB_LOGGING`

  首次发布时推荐值：

  - `DB_SYNCHRONIZE=false`
  - `DB_LOGGING=false`

  禁止在首次正式交付中依赖：

  - `DB_SYNCHRONIZE=true`

  ## 首次上线标准流程

  ### 1. 锁定发布版本

  - 确认当前将要发布的代码版本。
  - 确认该版本对应的 `entity` 与 baseline migrations 已同步。

  ### 2. 准备目标环境配置

  - 在目标环境写入正式环境 `.env`。
  - 再次确认 `DB_SYNCHRONIZE=false`。
  - 再次确认 `DB_NAME` 指向本次首次交付的目标库。

  ### 3. 执行空库建表

  对目标数据库执行：

  ```bash
  MIGRATION_DRILL_DATABASE=<目标数据库名> MIGRATION_DRILL_ALLOW_NON_TEST_DB=true npm run
  migration:drill:empty-db
  ```
  执行语义：

  - 脚本会连接目标 MySQL。
  - 在目标库上按 baseline migrations 建表。
  - 校验关键表、关键索引、关键外键。
  - 任一步失败都应视为数据库交付失败。

  ## 执行前确认

  在执行上一步前，必须明确以下事实：

  - 该命令面向“首次建表交付”。
  - 指定目标库时，脚本会先清空目标库再执行 migration。
  - 因此目标库必须是空库，或明确允许被清空。
  - 如果目标库中已有不可丢弃数据：

  - 不要执行本文流程。
  - 应停止发布。
  - 后续改走增量 migration 治理流程，而不是 baseline 首次交付流程。

  ## 成功判定

  - migration 命令退出码为 0
  - 关键表存在
  - 关键索引存在
  - 关键外键存在
  - API 进程可以正常连接数据库启动
  - Worker 进程可以正常连接数据库启动

  ## 启动顺序建议

  推荐顺序：

  1. 完成数据库 baseline 交付
  2. 启动 API
  3. 启动 Worker
  4. 再执行发布后健康检查

  不建议的顺序：

  - 在数据库未完成建表前先启动 API
  - 在数据库未完成建表前先启动 Worker
  - 依赖应用启动时的 synchronize 自动补结构

  ## 发布后检查

  数据库交付完成后，至少检查以下项目：

  - API 启动日志无数据库结构相关报错
  - Worker 启动日志无数据库结构相关报错
  - GraphQL 入口可访问
  - 一条最小业务链路可通过
  - 如启用了队列链路，至少确认一条最小异步任务可正常写入任务表

  ## 失败处理

  - 立即停止发布
  - 不要继续启动 API / Worker
  - 保留报错信息
  - 修复 migration / env / 数据库权限问题后重新执行

  若失败发生在“首次建表”阶段，且目标库允许重建：

  - 直接清空目标库后重跑本文流程

  若失败时目标库已进入非空且不可回滚状态：

  - 停止继续操作
  - 由人工确认现场状态
  - 不要临时改成 synchronize=true 强行启动应用

  ## 操作责任边界

  数据库首次交付阶段，各部分责任如下：

  - entity：表达当前代码认可的最终结构
  - baseline migrations：表达首次建库时应落下的最终结构
  - 本文：规定上线时如何执行首次数据库交付
  - API / Worker：只消费已准备完成的数据库结构，不负责建库兜底

  ## 与现有文档的关系

  - 原则文档：../project-convention/database-baseline-delivery.rules.md
  - 本文：首次发布时的数据库交付 SOP

  两者分工如下：

  - 原则文档负责解释为什么采用 baseline + drill 的交付方式
  - 本文负责说明发布人员具体执行什么步骤

  ## 一句话结论

  - 当前 1.0 首次上线阶段，数据库交付应通过 baseline migration 独立完成，应用启动不得承担建库职责。
