# AIGC Friendly Backend Framework

## Start Here

For AI/Agent: read `docs/README.md` first.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)
![NestJS](https://img.shields.io/badge/framework-NestJS-E0234E.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.19-green.svg)

基于 NestJS + TypeScript 的后端基础框架，当前以 GraphQL 为主入口，使用 MySQL + TypeORM，并遵循严格的分层架构约束。

## 💡 核心理念：AIGC Friendly

本项目专为 **AI 辅助编程（Copilot / Agent）** 场景优化，旨在提供一个 AI 容易理解、维护与扩展的后端框架基线：

- **清晰的上下文边界**：Adapters / Usecases / Core / Infrastructure 分层明确，AI 容易定位代码职责。
- **显式的依赖规则**：严格的单向依赖约束，减少 AI 生成循环依赖或错误引用的概率。
- **规范化的读写分离**：QueryService (读) 与 Usecases (写) 分离，便于 AI 识别副作用与事务边界。
- **自文档化代码**：通过显式的规则文档 (`docs/*.rules.md`) 与强类型约束，辅助 AI 进行更准确的代码生成。

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [项目结构与架构](#项目结构与架构)
- [功能概览](#功能概览)
- [Capability 治理基线](#capability-治理基线)
- [快速开始](#快速开始)
- [开发与测试](#开发与测试)
- [API 访问](#api-访问)
- [许可证](#许可证)

## 项目简介

项目面向可复用后端基础设施与分层架构治理场景，提供账号与会话鉴权、分页 / 排序 / 搜索、错误映射、输入规范化、事务边界与数据库基线交付能力，并内置基于 QM Worker 的 AI / Email 异步队列、任务审计与调试查询能力。它既是可直接扩展的基础框架，也是一套经过实践验证的 DDD 轻量级落地实现。

当前基线在严格横向分层之上提供轻量纵向 capability 治理：稳定 decision 文档定义语义边界，最小 Anchor 让边界在代码与运行时可指认，Runtime Contribution 只保留实际执行或校验的 runtime dependency 与 queue/job resource。进程和入口模块由 Nest module graph 推导，不维护平行 Catalog。

## 技术栈

- **Runtime**: Node.js
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: MySQL 8.0
- **ORM**: TypeORM
- **API Protocol**: GraphQL (Apollo Server)
- **Queue**: BullMQ + Redis
- **Auth**: Passport + JWT
- **Logging**: Pino
- **Configuration**: @nestjs/config
- **Validation**: class-validator + class-transformer
- **Testing**: Jest + Supertest

## 项目结构与架构

### 目录结构

```text
src/
├── adapters/                    # 入口适配层
│   ├── api/graphql/             # GraphQL resolver / DTO / guard / schema registry
│   └── worker/                  # BullMQ worker processor / handler / mapper
├── bootstraps/                  # 多入口启动层
│   ├── api/
│   │   ├── api.module.ts
│   │   └── main.ts
│   └── worker/
│       ├── worker.module.ts
│       └── main.ts
├── core/                        # 领域模型、纯规则、核心边界契约
├── infrastructure/              # 外部依赖实现（DB、配置、安全等）
├── modules/                     # 同域可复用服务（读写能力承载）
├── usecases/                    # 用例编排层（流程、事务、权限组合）
├── types/                       # 稳定共享契约与枚举
└── schema.graphql               # Nest autoSchemaFile 自动生成，非手写维护源
```

### 启动入口

- API 入口：`src/bootstraps/api/main.ts` + `src/bootstraps/api/api.module.ts`
- Worker 入口：`src/bootstraps/worker/main.ts` + `src/bootstraps/worker/worker.module.ts`

### 双启动的设计理念

- **职责隔离**：API 进程只处理请求接入与同步响应；Worker 进程只处理异步消费与重试。
- **运行时策略隔离**：并发、退避、重试、队列监听等 Worker 策略不污染 API 请求链路。
- **部署弹性**：可按流量独立扩缩容 API 与 Worker，避免互相抢占资源。
- **故障隔离**：队列堆积或第三方抖动主要影响 Worker，不直接拖垮 API 对外可用性。
- **边界清晰**：配合分层规则，形成“API 入队 -> Usecase 编排 -> Worker 消费”的稳定协作模型。

### 架构分层与依赖方向

项目采用固定分层，并限制依赖方向（Strict Layered Architecture）。基础主链路是：

```text
adapters -> usecases -> modules -> infrastructure
```

`core` 与 `types` 是受限的稳定支撑层，不参与运行时编排。

#### 1. 职责划分

- **`adapters`**: 协议入口层。负责 GraphQL / HTTP 输入解析、认证上下文接入、调用 usecase、映射输出；不承载业务编排，不直接依赖 modules 或 infrastructure 的运行时实现。
- **`usecases`**: 业务编排层。负责写流程、权限组合、事务入口、跨域协调与稳定输出装配。
- **`modules`**: 同域可复用能力层。封装仓储、实体访问、同域服务与 QueryService；业务域 modules 不做跨域业务编排。
- **`QueryService`**: modules 内的读侧模式。只读、判定读取可见性并规范化输出；由 usecase 调用，不作为 adapter 的直接入口。
- **`infrastructure`**: 外部系统与运行时实现层。负责 TypeORM、BullMQ、Redis、配置、日志、SDK、邮件、GraphQL 运行时等实现细节。
- **`core`**: 纯领域层。只放领域模型、值对象、纯规则、策略和 core-owned boundary contract；不读配置、不做 I/O、不依赖框架。
- **`types`**: 全局稳定共享契约层。只放跨上下文共享类型与枚举，通过 `@app-types/*` 引用，不依赖 core、GraphQL、ORM 或框架。
- **Boundary contract**: 不是独立分层，而是由拥有决策的层定义依赖边界；新增边界文件使用 `*.contract.ts`。

#### 2. 依赖规则

- **主链路**: `adapters -> usecases -> modules -> infrastructure`。
- **Adapter 稳定依赖**: `adapters` 可依赖 `usecases`、`core` 与 `types`；对 Core 仅限纯 policy、value object、DomainError、常量、normalize helper 与类型契约。输入侧只允许协议一致的纯解析/校验，场景业务语义仍由 usecase 选择。
- **其他稳定依赖**: `usecases`、`modules`、`infrastructure` 可在各自规则内依赖 `core` 与 `types`；`core` 只能依赖 core-local code 和允许的 `@app-types/*`；`types` 只能依赖 `types`。
- **模块边界**: 业务域 modules 可依赖 `modules/common`，不得依赖其他业务域 modules；`modules/common` 不得依赖业务域 modules。
- **用例边界**: `usecases -> usecases` 仅允许同域编排且一跳以内；跨域读写应上收到 usecase，而不是下沉到 modules 或 infrastructure。
- **禁止方向**: 任何层不得依赖 `adapters`；adapters 不直接调用 modules / infrastructure；infrastructure 不拥有业务决策。
- **共享类型**: 跨上下文稳定类型放在 `src/types` 并通过 `@app-types/*` 引用；同域稳定类型放在 `src/modules/<bounded-context>/<bounded-context>.types.ts`。

#### 3. 详细规则

更多细节请参考 `docs/` 下的规则文档：

- [Core Rules](docs/common/core.rules.md)
- [Adapters Rules](docs/api/adapters.rules.md)
- [GraphQL Error Contract](docs/api/graphql-error-contract-current.md)
- [Usecase Rules](docs/common/usecase.rules.md)
- [Modules Rules](docs/common/modules.rules.md)
- [Query Service Rules](docs/common/queryservice.rules.md)
- [Boundary Contract Rules](docs/common/boundary-contract.rules.md)
- [Type Rules](docs/common/type.rules.md)
- [Infrastructure Rules](docs/common/infrastructure.rules.md)
- [Capability Rules](docs/common/capability.rules.md)
- [Current Capability Decisions](docs/capabilities/current.md)
- [ESLint Architecture Rules](docs/common/eslint-architecture-rules.md)
- [Queue Identifiers Rules](docs/common/queue-identifiers.rules.md)
- [AI Task Lifecycle Audit Rules](docs/common/ai-task-lifecycle-audit.rules.md)
- [QM Worker Integration Rules](docs/worker/qm-worker-integration.rules.md)
- [Worker Adapter Rules](docs/worker/worker-adapter.rules.md)
- [Worker Usecase Rules](docs/worker/worker-usecase.rules.md)
- [Database Baseline Delivery Rules](docs/project-convention/database-baseline-delivery.rules.md)

## 功能概览

### 平台基础能力

- ✅ **GraphQL API**: 统一入口与错误映射
- ✅ **Auth & Security**: JWT 鉴权、角色访问控制 (RBAC)、字段加密、安全签名
- ✅ **Data Access**: 分页 / 排序 / 搜索通用能力、数据库事务支持
- ✅ **Observability**: 结构化日志 (Pino)、配置管理
- ✅ **QM Worker Base**: 统一 AI / Email 队列接入、消费链路与模块装配模式
- ✅ **Capability Governance**: 能力 Anchor、显式行为 gate、依赖状态、Worker 激活点与 generated capability 清单
- ✅ **AI Provider Call Record**: 记录 provider 调用链路、请求响应快照与耗时指标，支撑审计与排障

### 基础域能力

- ✅ **Account**: 基础账号、UserInfo、密码与资料更新、可见性视图
- ✅ **Auth**: 账号密码登录 / 第三方登录集成
- ✅ **Registration**: 邮箱注册流程 / 第三方快捷注册
- ✅ **Role Baseline**: 通用角色与访问组基线 (ADMIN / STAFF / GUEST / REGISTRANT)
- ✅ **Third-party Account**: 第三方身份解析、绑定、解绑与微信小程序辅助能力
- ✅ **Verification**: 验证码生成与验证流程 (重置密码、绑定第三方身份等基础验证类型)
- ✅ **AI Queue & Worker**: 支持 `queueAiGenerate` / `queueAiEmbed` 入队与 provider 路由消费
- ✅ **AI Workflow Baseline**: 支持最小 workflow context、admission、worker handler registry 与 `generic_text_generate`
- ✅ **Async Task Audit**: 支持按 `traceId` / 业务锚点 / 队列任务标识进行调试查询

## Capability 治理基线

Capability 是既有 `adapters -> usecases -> modules -> infrastructure` 分层上的纵向功能边界，不是新的分层或服务拆分方案。治理遵循“能推导的推导、只声明会执行的决策、散文回文档”。

- **决策权限**：纵向模型的成熟度仍在实践中验证，但规则执行是严格的；Capability 的新增、拆分、合并、删除、重分类或 mode 变化必须来自已接受 decision、经人类批准的 active plan 或当前任务中的人类决策，AIGC 提案本身不构成授权。
- **语义决策**：`docs/capabilities/*.md` 定义 capability 拥有什么、边界在哪里；组合 usecase、报表或 runtime consumer 不会因依赖关系自动成为 capability。
- **Capability Anchor**：`@CapabilityAnchorProvider(...)` 只声明 `capabilityId`、`mode`、`decisionRef` 与传递约简后的 `requires`；只有真实行为 gate 已存在时才允许安装 Anchor。
- **Runtime Contribution**：`@CapabilityRuntimeContributionProvider(...)` 可选，只声明 registry 实际校验的同进程 runtime dependency 与 queue/job resource；provider、payload 与 handler 仍由原有代码和 registry 负责。
- **推导装配**：入口模块和 API/Worker 安装进程从 Nest module graph 推导，不手写 process、physical scope 或文件清单。
- **状态语义**：`switchable` 能力通过 `CAPABILITY_DISABLED_IDS` 表达配置意图；有效状态区分 `not_installed`、`disabled`、`blocked` 与 `enabled`，health 与启停正交。
- **显式行为 gate**：owner-facing service 调用 `requireEnabled`；没有通用 GraphQL guard、dispatcher、session builder 或 permission registry 代替真实行为边界。
- **Worker 观察点**：可关闭能力的 processor 使用 `autorun: false`，由激活用例在 `getState` 确认为 effective `enabled` 后启动；关闭时不领取 backlog，也不把合法关闭状态变成启动错误。
- **跨进程协作**：API 与 Worker 之间使用显式 BullMQ queue/job contract，不使用 capability envelope 隐藏进程边界。
- **跨能力调用**：优先复用 owner-facing surface 或窄 typed contract，普通调用不经过 capability bus。
- **本地观察**：`npm run capability:list` 查看从模块图计算出的浅投影，`npm run capability:docs` 生成 `docs/generated/capabilities-current.md`，`npm run capability:docs:check` 校验同步。入口模块只是代码导航起点，不声称提供文件级 ownership 视图。

新增或合并 capability 代码时，先读：

- [Capability Rules](docs/common/capability.rules.md)
- [Capability Adoption Guide](docs/common/capability-plugin-authoring.guide.md)
- [Capability Boundary Examples](docs/common/capability-boundary-examples.md)
- [Current Capability Decisions](docs/capabilities/current.md)
- [Current Capability Projection](docs/generated/capabilities-current.md)

## 快速开始

### 环境准备

- Node.js >= 20.19
- MySQL >= 8.0
- npm

### 安装与运行

1. **安装依赖**

   ```bash
   npm install
   ```

2. **配置环境变量**

   ```bash
   cp env/.env.example env/.env.development
   # 编辑 env/.env.development，填入数据库、JWT、字段加密、分页签名等必要配置
   ```

3. **启动应用**

   ```bash
   # 开发模式（API）
   npm run start:dev

   # 开发模式（Worker）
   npm run dev:worker

   # 构建生产产物
   npm run build

   # 生产模式（API，依赖 dist）
   npm run start:prod

   # 生产模式（Worker，依赖 dist，需要 Redis / BullMQ 配置）
   npm run start:worker
   ```

### 生产部署日志目录要求

- 生产环境下，默认日志目录为 `/var/log/backend`，会写入 `app.log` 与 `error.log`。
- 部署容器或机器时，必须提前创建该目录并确保运行进程用户具备写权限。
- 若目录不可写，生产日志链路会失败，排障与审计信息可能缺失。

## 开发与测试

### 常用命令

```bash
# 代码格式化
npm run format

# Lint 检查与修复
npm run lint

# TypeScript 类型检查
npm run typecheck

# 构建生产产物（API / Worker 共享 dist）
npm run build

# 查看当前 capability id / process / contribution 清单
npm run capability:list

# 生成并校验 capability generated docs
npm run capability:docs
npm run capability:docs:check
```

### 测试策略

```bash
# 单元测试 (Unit Test)
npm run test:unit

# 单元测试覆盖率
npm run test:cov

# Core E2E：GraphQL / Auth / Account / Verification / Pagination 等基础 API
npm run test:e2e:core

# Worker E2E：Email / AI 队列入队、消费与审计链路
npm run test:e2e:worker

# 指定单个 E2E 文件
npm run test:e2e:file -- test/01-auth/auth.e2e-spec.ts
npm run test:e2e:file -- worker test/08-qm-worker/ai-workflow-generic-handler.e2e-spec.ts

# 真实第三方 smoke，需要外部密钥与服务可用
npm run test:e2e:smoke
```

- 真实第三方受控 Smoke 单独放在 `test/99-third-party-live-smoke/`
- E2E 默认读取 `env/.env.e2e`，会按测试组清理目标 MySQL 测试库与 Redis DB。

### 基础 CI 能力（空库 migration 演练）

```bash
# 默认演练：读取演练环境的 DB_NAME，清空目标库后执行 baseline migrations
npm run migration:drill:empty-db

# 首次建表：落到指定数据库（会先清空目标库）
MIGRATION_DRILL_DATABASE=<目标数据库名> MIGRATION_DRILL_ALLOW_NON_TEST_DB=true npm run migration:drill:empty-db

# 临时库演练：要求数据库账号具备 CREATE/DROP DATABASE 权限
MIGRATION_DRILL_CREATE_TEMP_DB=true npm run migration:drill:empty-db
```

- 脚本会校验关键表、关键索引、关键外键，失败会返回非 0 退出码，可直接作为 CI 阻断项。
- 脚本内部固定 `synchronize=false`，不受 e2e 环境 `DB_SYNCHRONIZE=true` 影响。
- 若目标库名包含 `test/drill/ci`，可不传 `MIGRATION_DRILL_ALLOW_NON_TEST_DB=true`。

### 开发约定

- **写操作 (Command)**: 统一在 `usecases` 层编排，处理事务。
- **读操作 (Query)**: 优先在 `modules` 层的 QueryService 实现，由 usecase 调用并输出稳定视图。
- **事务边界**: 由 usecase 通过 `TransactionRunner` 进入事务；usecase 不直接操作 TypeORM API。
- **外部依赖**: 通过拥有决策的层定义 `*.contract.ts`，由 `infrastructure` 实现或适配，业务代码不直接依赖 SDK。
- **共享类型**: 跨上下文稳定类型放在 `src/types`，通过 `@app-types/*` 引用。
- **GraphQL**: DTO / Input / Args / Result 保持在 adapter 层；枚举、标量与 schema 初始化放在 `src/adapters/api/graphql/schema/`。
- **ORM Entity**: 只表达持久化结构，不添加 GraphQL / HTTP / Swagger 等 adapter decorator。
- **Capability**: 稳定 decision 与已安装 Anchor 是能力语义和代码锚点；switchable 行为必须保留显式 gate，generated capability 文档只能由命令生成；普通跨能力调用不引入 dispatcher / bus。

## API 访问

项目启动后（默认 `APP_HOST=127.0.0.1`、`APP_PORT=3000`）：

- **GraphQL Endpoint**: [http://127.0.0.1:3000/graphql](http://127.0.0.1:3000/graphql)
- **GraphQL Sandbox**: 由 `GRAPHQL_SANDBOX_ENABLED` 控制；生产环境默认应关闭。
- **Introspection**: 由 `GRAPHQL_INTROSPECTION_ENABLED` 控制；生产环境默认应关闭。
- **Schema File**: `src/schema.graphql` 由 Nest `autoSchemaFile` 自动生成，不作为手写维护源。

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 相关资源

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [Apollo GraphQL](https://www.apollographql.com/docs/apollo-server/)
