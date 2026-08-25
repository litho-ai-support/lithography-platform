<!-- docs/human/worker-first-release.zh-CN.md -->
 
 # Worker First Release Guide

  本文件面向首次发布时的人工交付与检查。
  它不是分层规则文档，也不是 AIGC 默认入口。
  Machine-first entry `docs/README.md`。

  ## 1. 适用范围

  - 适用于 Worker 服务首次进入正式环境的发布场景
  - 适用于当前项目基于 BullMQ 的异步消费进程
  - 适用于数据库已完成首次建库交付、Redis 已可用的前提下
  - 不用于已有稳定线上环境的常规滚动升级说明

  ## 2. 发布目标

  首次发布时，Worker 侧至少应满足以下条件：

  - Worker 能以正式环境配置独立启动
  - Worker 能稳定连接数据库
  - Worker 能稳定连接 Redis / BullMQ
  - 队列消费行为与正式环境开关一致
  - Worker 不依赖 `DB_SYNCHRONIZE` 自动改库
  - Worker 可与同版本 API 协同运行

  ## 3. 发布前提

  执行 Worker 首次发布前，必须先确认：

  - 数据库已按首次发布流程完成 baseline 建表
  - Redis 已准备完成，连接信息已确认
  - 当前发布版本已冻结
  - Worker 使用的正式环境变量已准备完成
  - API 与 Worker 使用同一版本的数据库结构与配置口径
  - 未准备上线的队列能力、调试入口和第三方依赖已明确关闭或受控

  ## 4. 必查环境变量

  至少确认以下变量已正确配置。

  ### 基础运行

  - `NODE_ENV=production`
  - `APP_NAME`

  说明：

  - Worker 不是 HTTP 服务主入口，但仍应保持统一环境标识

  ### 日志

  - `LOG_LEVEL`
  - `LOG_INCLUDE_REQUEST_META`

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

  ### Redis / BullMQ

  - `REDIS_HOST`
  - `REDIS_PORT`
  - `REDIS_DB`
  - `REDIS_PASSWORD`
  - `REDIS_TLS`
  - `BULLMQ_PREFIX`

  要求：

  - 必须确认正式环境 Redis DB 与 prefix 不会误连测试环境
  - API 与 Worker 应使用一致的 BullMQ 前缀策略

  ### 字段加密

  - `FIELD_ENCRYPTION_KEY`
  - `FIELD_ENCRYPTION_IV`

  ### JWT

  - `JWT_SECRET`
  - `JWT_ISSUER`
  - `JWT_AUDIENCE`

  说明：

  - 即使 Worker 本身不直接对外签发 token，也应保证共享配置口径一致

  ### Worker 调试入口

  - `AI_QUEUE_DEBUG_ENABLED`
  - `EMAIL_QUEUE_DEBUG_ENABLED`

  首次发布建议：

  - `AI_QUEUE_DEBUG_ENABLED=false`
  - `EMAIL_QUEUE_DEBUG_ENABLED=false`

  ### AI Provider

  - `AI_PROVIDER_MODE`
  - `QWEN_BASE_URL`
  - `QWEN_API_KEY`
  - `QWEN_GENERATE_MODEL`
  - `QWEN_GENERATE_TIMEOUT_MS`
  - `OPENAI_BASE_URL`
  - `OPENAI_API_KEY`
  - `OPENAI_GENERATE_TIMEOUT_MS`

  ### 邮件投递

  - `EMAIL_SEND_AS_USER`

  ### 微信小程序

  - `WECHAT_APP_ID`
  - `WECHAT_APP_SECRET`

  要求：

  - 未准备上线的第三方能力，应显式关闭或保持不可用状态
  - 不要让 Worker 在首发时误调用未准备完成的真实第三方

  ## 5. 队列与消费策略确认

  首次发布前，必须明确以下问题：

  - 本次上线哪些队列允许正式消费
  - AI 队列是否首发即开
  - Email 队列是否首发即开
  - 是否允许真实第三方调用
  - 是否保留任何调试入口

  最低要求：

  - 队列是否开启必须是明确决策，不要依赖默认值
  - 调试入口默认应关闭
  - 未准备好的真实 provider 不应在首发时隐式放开

  ## 6. 启动顺序

  1. 确认数据库交付完成
  2. 确认 Redis / BullMQ 可用
  3. 启动 API
  4. 确认 API 已能正常入队
  5. 启动 Worker
  6. 观察 Worker 启动日志与消费状态
  7. 执行最小异步链路检查

  不建议：

  - 在数据库未完成建表前先启动 Worker
  - 在 Redis 未确认可用前先启动 Worker
  - API 尚未准备好时让 Worker 先行消费正式流量
  - 依赖 `DB_SYNCHRONIZE=true` 补结构

  ## 7. 启动后最小检查

  Worker 首次启动后，至少确认以下事项：

  - 进程启动成功，无配置缺失错误
  - 数据库连接正常
  - Redis 连接正常，未出现认证、网络或 DB 选择错误
  - BullMQ runtime 初始化成功，关键队列已正确注册
  - 至少一条测试任务可被 Worker 拉取并进入可观测的消费状态

  ## 8. 最小业务验收链路

  首次发布后，建议至少执行以下最小链路：

  - API 成功入队一条任务
  - Worker 成功消费一条任务
  - `AsyncTaskRecord` 能看到完整生命周期
  - 若启用了 AI provider，再验证一条 provider 调用记录
  - 若启用了 Email 队列，再验证一条邮件任务消费链路

  目标不是做完整回归，而是确认 Worker 在正式环境的最小可用性和可观测性。

  ## 9. 日志与排障

  首次发布时，Worker 侧应明确：

  - 启动日志在哪里看
  - Redis 连接失败怎么看
  - BullMQ 队列失败怎么看
  - 消费失败后如何定位 `jobId`、`traceId`
  - 如何查看异步任务记录
  - 若启用了 AI，如何查看 provider 调用记录

  若这些问题在发布前答不清楚，说明 Worker 交付还未收口。

  ## 10. 禁止事项

  首次发布阶段，禁止以下操作：

  - 临时改 `DB_SYNCHRONIZE=true` 顶上线
  - 将测试 Redis / BullMQ 配置直接带入正式环境
  - 默认开启 `AI_QUEUE_DEBUG_ENABLED` 或 `EMAIL_QUEUE_DEBUG_ENABLED`
  - 将未准备好的真实 provider 一起放开
  - API 与 Worker 使用不同的 schema / env 口径发布
  - 在未确认消费边界前直接放开全部异步链路

  ## 11. 失败处理

  若 Worker 启动失败：

  - 立即停止继续发布
  - 保留启动错误日志
  - 先确认环境变量、数据库连接、Redis 连接、BullMQ 配置、第三方配置
  - 修复后重新启动验证

  若 Worker 能启动但消费异常：

  - 暂停继续放量
  - 先确认队列连接、payload 契约、异步任务记录与第三方依赖状态
  - 必要时先停止 Worker，再排查，不要带病持续消费

  若数据库未完成交付就导致 Worker 启动异常：

  - 停止 Worker 发布
  - 先回到数据库首次交付流程
  - 不要让 Worker 承担建库职责
