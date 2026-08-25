<!-- docs/human/api-first-release.zh-CN.md -->

  # API First Release Guide

  本文件面向首次发布时的人工交付与检查。
  它不是分层规则文档，也不是 AIGC 默认入口。
  Machine-first entry: `docs/README.md`。

  ## 1. 适用范围

  - 适用于 API 服务首次进入正式环境的发布场景
  - 适用于当前项目的 API / Worker 双进程形态
  - 适用于数据库已完成首次建库交付的前提下
  - 不用于已有稳定线上环境的常规滚动升级说明

  ## 2. 发布目标

  首次发布时，API 侧至少应满足以下条件：

  - API 能以正式环境配置独立启动
  - API 能稳定连接数据库
  - GraphQL 入口符合预期暴露策略
  - JWT、字段加密、CORS、日志等关键配置已完成正式化
  - API 不依赖 `DB_SYNCHRONIZE` 自动改库
  - API 可与同版本 Worker 协同运行

  ## 3. 发布前提

  执行 API 首次发布前，必须先确认：

  - 数据库已按首次发布流程完成 baseline 建表
  - 当前发布版本已冻结
  - API 使用的正式环境变量已准备完成
  - Redis、JWT、加密密钥、第三方配置等关键依赖已准备完成
  - 若 Worker 同时发布，双方使用同一版本的数据库结构与配置口径

  ## 4. 必查环境变量

  至少确认以下变量已正确配置。

  ### 基础运行

  - `NODE_ENV=production`
  - `APP_NAME`
  - `APP_HOST`
  - `APP_PORT`
  - `DEBUG`

  ### 日志

  - `LOG_LEVEL`
  - `LOG_INCLUDE_REQUEST_META`

  ### CORS

  - `APP_CORS_ENABLED`
  - `APP_CORS_ORIGINS`
  - `APP_CORS_CREDENTIALS`

  ### GraphQL 暴露开关

  - `GRAPHQL_SANDBOX_ENABLED`
  - `GRAPHQL_INTROSPECTION_ENABLED`

  ### 数据库

  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASS`
  - `DB_NAME`
  - `DB_TIMEZONE`
  - `DB_POOL_SIZE`
  - `DB_SYNCHRONIZE=false`
  - `DB_LOGGING=false`

  ### Redis / Queue 相关

  - `REDIS_HOST`
  - `REDIS_PORT`
  - `REDIS_DB`
  - `REDIS_PASSWORD`
  - `REDIS_TLS`
  - `BULLMQ_PREFIX`

  说明：

  - API 首发即使不直接消费队列，也应保证与 Worker 共用的 Redis / BullMQ 配置口径清晰
  - 不要让正式环境误连测试 Redis DB 或错误 prefix

  ### 字段加密

  - `FIELD_ENCRYPTION_KEY`
  - `FIELD_ENCRYPTION_IV`

  ### JWT

  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
  - `JWT_REFRESH_EXPIRES_IN`
  - `JWT_ALGORITHM`
  - `JWT_ENABLE_REFRESH`
  - `JWT_ISSUER`
  - `JWT_AUDIENCE`
  - `PAGINATION_HMAC_SECRET`

  ### 邮件与 Worker 调试入口

  - `EMAIL_SEND_AS_USER`
  - `AI_QUEUE_DEBUG_ENABLED`
  - `EMAIL_QUEUE_DEBUG_ENABLED`

  首次发布建议：

  - `AI_QUEUE_DEBUG_ENABLED=false`
  - `EMAIL_QUEUE_DEBUG_ENABLED=false`

  ### AI Provider

  - `AI_PROVIDER_MODE`
  - `QWEN_BASE_URL`
  - `QWEN_API_KEY`
  - `QWEN_GENERATE_TIMEOUT_MS`
  - `OPENAI_BASE_URL`
  - `OPENAI_API_KEY`
  - `OPENAI_GENERATE_TIMEOUT_MS`

  说明：

  - `QWEN_GENERATE_MODEL` 不是运行时读取项，不作为首发必查环境变量
  - Qwen / OpenAI 的 `model` 由任务输入 payload 提供，不通过 env 固定

  ### 微信小程序

  - `WECHAT_APP_ID`
  - `WECHAT_APP_SECRET`

  要求：

  - 未准备上线的第三方能力，应显式关闭或保持不可用状态
  - 不要依赖空值碰运气通过首发

  ## 5. GraphQL 暴露策略

  首次发布前，必须明确以下问题：

  - 是否允许 GraphQL sandbox
  - 是否允许 introspection
  - 是否只允许受控来源访问
  - 是否需要在发布后保留调试入口

  当前代码语义要点：

  - 生产环境冻结校验要求显式提供 `GRAPHQL_SANDBOX_ENABLED` 与 `GRAPHQL_INTROSPECTION_ENABLED`
  - 两个开关在“未显式设置”时都采用 `!isProduction`，因此生产环境默认关闭 sandbox 与 introspection
  - CORS 来源由 `APP_CORS_ORIGINS` 控制，不应留空后直接对公网开放

  ## 6. 启动顺序

  推荐顺序：

  1. 确认数据库交付完成
  2. 写入 API 正式环境配置
  3. 启动 API
  4. 观察启动日志
  5. 执行最小健康检查
  6. 若需联动发布，再启动 Worker

  不建议：

  - 在数据库未完成建表前先启动 API
  - 依赖 `DB_SYNCHRONIZE=true` 补结构
  - API 与 Worker 使用不一致的环境变量口径

  ## 7. 启动后最小检查

  API 首次启动后，至少确认以下事项：

  - 进程启动成功，无配置缺失错误
  - 数据库连接正常
  - `GET /health` 返回 200，且响应包含 `status=ok`
  - `GET /health/readiness` 返回 200，且数据库检查为 `up`
  - GraphQL 入口可访问
  - JWT 签发与鉴权正常
  - 结构化日志正常输出
  - 常规 4xx/5xx 日志格式符合预期
  - 若启用了第三方登录或二维码能力，相关入口按预期工作

  说明：

  - `GET /health` 用于 liveness 检查
  - `GET /health/readiness` 用于 readiness 检查；当数据库不可用时应返回 503

  ## 8. 最小业务验收链路

  首次发布后，建议至少执行以下最小链路：

  - 一个基础 GraphQL 健康访问
  - 一个登录链路
  - 一个注册或 verification 链路
  - 一个需要鉴权的受保护接口
  - 若首发启用了第三方能力，再补一条对应链路

  目标不是做完整回归，而是确认 API 在正式环境的最小可用性。

  ## 9. 日志与排障

  首次发布时，API 侧应明确：

  - 日志输出位置是否可写
  - 错误日志是否可单独检索
  - 启动失败时看哪一段日志
  - 认证失败、配置失败、数据库失败、GraphQL 暴露问题分别如何定位

  若这些问题在发布前答不清楚，说明交付还未收口。

  ## 10. 禁止事项

  首次发布阶段，禁止以下操作：

  - 临时改 `DB_SYNCHRONIZE=true` 顶上线
  - 用开发环境默认值代替正式环境配置
  - 在未确认 CORS / 暴露策略前直接开放对外访问
  - 将未准备好的第三方能力一起放开
  - API 与 Worker 使用不同的 schema / env 口径发布
  - 默认开启 `AI_QUEUE_DEBUG_ENABLED` 或 `EMAIL_QUEUE_DEBUG_ENABLED`

  ## 11. 失败处理

  若 API 启动失败：

  - 立即停止继续放量或继续发布
  - 保留启动错误日志
  - 先确认环境变量、数据库连接、密钥配置、暴露策略
  - 修复后重新启动验证

  若数据库未完成交付就导致 API 启动异常：

  - 停止 API 发布
  - 先回到数据库首次交付流程
  - 不要让 API 承担建库职责
