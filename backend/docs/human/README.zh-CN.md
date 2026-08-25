  <!-- docs/human/README.zh-CN.md -->

 # 文档导航
 
 本文件面向中文使用者。
 AIGC/Agent 默认不要优先读取本文件，除非用户明确要求中文说明或英文索引不足以完成任务。
 Machine-first entry: `docs/README.md`
 
 这份索引主要帮你快速做三件事：

 - 了解 `docs/` 下每个目录的用途
 - 遇到具体任务时，快速定位最该先看的文档
 - 通过一行描述判断文档是否与你当前问题相关

 建议的阅读方式：

 - 不用一开始就通读整个 `docs/`
 - 先按“任务路由”找到最相关的 1~2 份文档
 - 如果还不能解决问题，再逐步扩大阅读范围

  ## 目录用途

  - `docs/common/`
    - 全局分层规则与跨模块共识
  - `docs/api/`
    - API / GraphQL 适配层规则
  - `docs/worker/`
    - QM Worker / 队列 / 异步消费规则
  - `docs/project-convention/`
    - 当前项目的专题约定，如输入收敛、时间语义、数据库 baseline、E2E 分组

  ## 任务路由

  - 看分层边界：
    - 先读 `docs/common/core.rules.md`
    - 再按层读 `docs/common/modules.rules.md`、`docs/common/usecase.rules.md`、`docs/common/usecase-write-flow-boundaries.rules.md`、`docs/api/adapters.rules.md`、`docs/common/infrastructure.rules.md`
  - 看规则冲突怎么裁决：
    - 读 `docs/common/rule-precedence.rules.md`
  - 看 QueryService / 类型归位：
    - 读 `docs/common/queryservice.rules.md` 和 `docs/common/type.rules.md`
  - 看输入收敛：
    - 先读 `docs/project-convention/input-field-design.md`
    - 再读 `docs/project-convention/input-normalize-v1-boundaries.md`
  - 看时间字段 / 时间 normalize：
    - 先读 `docs/project-convention/time-field-design.md`
    - 再读 `docs/project-convention/time-normalize-v1-boundaries.md`
  - 看数据库首次建库 / baseline：
    - 读 `docs/project-convention/database-baseline-delivery.rules.md`
  - 看 E2E 怎么跑：
    - 读 `docs/project-convention/e2e-test-groups.md`
  - 看 AI / 队列标识 / 审计：
    - 先读 `docs/common/queue-identifiers.rules.md`
    - 再读 `docs/common/ai-task-lifecycle-audit.rules.md`
    - 若涉及 provider 调用落库，再读 `docs/project-convention/ai-provider-call-persistence.rules.md`
  - 看 Worker 新队列怎么接：
    - 先读 `docs/worker/qm-worker-integration.rules.md`
    - 再读 `docs/worker/worker-adapter.rules.md` 和 `docs/worker/worker-usecase.rules.md`
  - 看 Email Worker：
    - 读 `docs/worker/email-worker-delivery.rules.md`
  - 看 Skill 约定：
    - 读 `docs/common/skills.rules.md`

  ## 文档索引

  ### `docs/api`

  - `docs/api/adapters.rules.md`
    - Adapter 层只做输入解析、权限接入、输出封装，禁止直接触达 modules / infrastructure

  ### `docs/common`

  - `docs/common/ai-task-lifecycle-audit.rules.md`
    - AI 异步任务从入队到 worker 完成/失败的审计字段、状态和 reason 语义
  - `docs/common/core.rules.md`
    - Core 层只放纯领域规则、值对象和端口，不碰框架与 I/O
  - `docs/common/infrastructure.rules.md`
    - Infrastructure 只做外部依赖实现，不做业务编排
  - `docs/common/modules.extra.rules.md`
    - Modules(service) 的补充约定，如统一分页、同域事务回调和 service 注释建议
  - `docs/common/modules.rules.md`
    - Modules(service) 负责同域复用服务与 QueryService，禁止跨域编排
  - `docs/common/queryservice.rules.md`
    - QueryService 的职责、拆分原则、读侧权限和输出规范化边界
  - `docs/common/rule-precedence.rules.md`
    - 多份规则同时适用时的优先级与冲突裁决顺序
  - `docs/common/queue-identifiers.rules.md`
    - 队列链路里 `jobId`、`dedupKey`、`traceId`、`requestId` 的职责分离规则
  - `docs/common/skills.rules.md`
    - 如何编写和使用可复用 Skill 的命名、结构和触发描述
  - `docs/common/type.rules.md`
    - Type / enum / GraphQL type 的归位规则，避免重复定义和反向依赖
  - `docs/common/usecase.rules.md`
    - Usecase 的编排边界、事务职责、依赖方向和错误/权限处理规则
  - `docs/common/usecase-write-flow-boundaries.rules.md`
    - 多实体写流程拆分、跨步骤编排与 Transaction Root 边界规则

  ### `docs/project-convention`

  - `docs/project-convention/ai-provider-call-persistence.rules.md`
    - `ai_provider_call_record` 的字段语义、写入边界和与 `AsyncTaskRecord` 的分工
  - `docs/project-convention/database-baseline-delivery.rules.md`
    - 当前首版阶段的数据库 baseline migration 交付规则与空库 drill 原则
  - `docs/project-convention/e2e-test-groups.md`
    - `core / worker / smoke` 三类 E2E 的分组、命令和选择逻辑
  - `docs/project-convention/input-field-design.md`
    - 输入收敛总原则：Adapter 拦脏数据，Normalize 收敛值，Usecase 做业务决策
  - `docs/project-convention/input-normalize-v1-boundaries.md`
    - `normalizeRequiredText`、`normalizeOptionalText`、`normalizeTextList` 等 primitive 的职责边界
  - `docs/project-convention/time-field-design.md`
    - `TIMESTAMP(3)`、`DATE`、`DATETIME` 的语义区分与使用规则
  - `docs/project-convention/time-normalize-v1-boundaries.md`
    - `parse / normalize / format / guard` 四类时间处理函数的职责边界

  ### `docs/worker`

  - `docs/worker/email-worker-delivery.rules.md`
    - Email Worker 的分层落位，以及 sendmail / Postfix 的职责边界
  - `docs/worker/qm-worker-integration.rules.md`
    - 新增 QM Worker 队列时的统一接入清单、落位规范和测试要求
  - `docs/worker/worker-adapter.rules.md`
    - Worker Adapter 只做运行时适配，不能把 BullMQ 生命周期扩成业务编排
  - `docs/worker/worker-usecase.rules.md`
    - Worker Usecase 的输入契约、生命周期入口和降级失败落库要求
