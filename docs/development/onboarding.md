# 新人本地开发环境初始化

本文档适用于首次 clone 光刻机智能运维平台的开发者。目标是在个人电脑上得到一套可登录、可联调且与团队数据库结构一致的本地环境。

## 1. 环境要求

- Git
- Node.js 22.19.0（仓库根目录 `.nvmrc` 已固定版本）
- npm
- MySQL 8.0
- Redis

MySQL 和 Redis 可以运行在每个人自己的电脑上。三个人不需要共用同一台数据库服务器；Migration 保证结构一致，Seed 保证开发模拟数据一致。

## 2. Clone 和安装依赖

```powershell
git clone https://github.com/litho-ai-support/lithography-platform.git
cd lithography-platform
npm run install:all
```

`npm run install:all` 使用前后端各自的 lockfile 执行 `npm ci`，不要在没有依赖变更的情况下重新生成 lockfile。

## 3. 创建个人数据库

在本地 MySQL 中创建专用开发库：

```sql
CREATE DATABASE lithography_drill
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

推荐每个人都使用 `lithography_drill`。数据库位于各自电脑，不会相互覆盖；名称包含 `drill`，可通过建表脚本的安全检查。

## 4. 配置后端环境

```powershell
Copy-Item backend\env\.env.example backend\env\.env.development
```

`backend/env/.env.development` 被 Git 忽略，禁止提交。至少确认以下配置：

```dotenv
NODE_ENV=development
APP_HOST=127.0.0.1
APP_PORT=3000

APP_CORS_ENABLED=true
APP_CORS_ORIGINS=http://localhost:5173
APP_CORS_CREDENTIALS=true

GRAPHQL_SANDBOX_ENABLED=true
GRAPHQL_INTROSPECTION_ENABLED=true

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=<个人 MySQL 账号>
DB_PASS=<个人 MySQL 密码>
DB_NAME=lithography_drill
DB_TIMEZONE=+08:00
DB_POOL_SIZE=10
DB_SYNCHRONIZE=false
DB_LOGGING=false

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=15
REDIS_PASSWORD=
REDIS_TLS=false
BULLMQ_PREFIX=lithography

FIELD_ENCRYPTION_KEY=<团队开发环境字段加密 Key，至少 16 个字符>
FIELD_ENCRYPTION_IV=<团队开发环境字段加密 IV，至少 16 个字符>
JWT_SECRET=<团队开发环境 JWT 密钥>
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d
JWT_ALGORITHM=HS256
JWT_ENABLE_REFRESH=false
JWT_ISSUER=lithography-local
JWT_AUDIENCE=DESKTOP,SSTSTEST,SSTSWEB,SSTSWEAPP,SJWEB,SJWEAPP
PAGINATION_HMAC_SECRET=<团队开发环境分页签名密钥>

AI_PROVIDER_MODE=mock
AI_QUEUE_DEBUG_ENABLED=false
EMAIL_QUEUE_DEBUG_ENABLED=false

MOCK_SEED_PASSWORD=<团队统一 Mock 登录密码>
```

负责人通过私密渠道提供以下团队开发值，不得写入 GitHub、Issue、PR 或日志：

- `FIELD_ENCRYPTION_KEY`
- `FIELD_ENCRYPTION_IV`
- `JWT_SECRET`
- `PAGINATION_HMAC_SECRET`
- `MOCK_SEED_PASSWORD`

`FIELD_ENCRYPTION_KEY` 和 `FIELD_ENCRYPTION_IV` 必须与本机启动 API 时使用的值相同，否则 API 无法解密 Seed 写入的 `meta_digest`，登录安全校验会失败。

## 5. 从 Migration 建表

只对刚创建的个人 `lithography_drill` 执行：

```powershell
cd backend
$env:MIGRATION_DRILL_DOTENV='env/.env.development'
npm run migration:drill:empty-db
```

该命令会删除目标库中的全部表，再从 Migration 重建并检查 14 张表、关键字段、索引、外键和 CHECK 约束。它是破坏性空库演练命令，禁止指向共享库、正式库或包含需保留数据的数据库。

`DB_SYNCHRONIZE` 必须保持 `false`。团队数据库结构只能由 Migration 交付，不能依赖 TypeORM 自动改表。

## 6. 导入全量 Mock Data

```powershell
$env:SEED_DOTENV='env/.env.development'
npm run seed:mock
```

Seed 会填充当前全部 14 张表，并校验密码散列、角色密文、数据量和业务关联。它不会清空数据库，可重复执行；除设备型号外，Mock 自增主键使用 `900000-999999` 保留区间。

可登录账号如下，密码统一取自 `MOCK_SEED_PASSWORD`：

| 角色          | 登录名                |
| ------------- | --------------------- |
| `SUPER_ADMIN` | `mock_super_admin`    |
| `ENGINEER`    | `mock_engineer_chen`  |
| `ENGINEER`    | `mock_engineer_li`    |
| `CUSTOMER`    | `mock_customer_alpha` |
| `CUSTOMER`    | `mock_customer_beta`  |

## 7. 启动后端并验证登录

确保 MySQL 和 Redis 均已启动。回到仓库根目录，执行：

```powershell
npm run dev:backend
```

默认地址：

- 健康检查：`http://127.0.0.1:3000/health`
- GraphQL Sandbox：`http://127.0.0.1:3000/graphql`

本项目后端使用 GraphQL Code First。开发者编写 DTO、Input、Resolver 和装配代码，NestJS 启动时自动生成 `backend/src/schema.graphql`。该生成文件被 Git 忽略，禁止手工维护或提交。

在 GraphQL Sandbox 中先验证登录：

```graphql
mutation Login($input: AuthLoginInput!) {
  login(input: $input) {
    accessToken
    refreshToken
    accountId
    role
    userInfo {
      accountId
      nickname
      accessGroup
    }
  }
}
```

变量：

```json
{
  "input": {
    "loginName": "mock_engineer_chen",
    "loginPassword": "填写 MOCK_SEED_PASSWORD 的实际值",
    "type": "PASSWORD",
    "audience": "SSTSWEB"
  }
}
```

登录成功必须返回 `accessToken`、`accountId`、`ENGINEER` 角色和用户信息。不要把真实 Token 贴进 PR。

## 8. 配置和启动前端

新开终端，在仓库根目录执行：

```powershell
Copy-Item frontend\env\.env.development.example frontend\env\.env.development.local
```

编辑 `frontend/env/.env.development.local`：

```dotenv
VITE_APP_ENV=dev
DEV_SERVER_HOST=localhost
DEV_SERVER_PORT=5173
DEV_SERVER_STRICT_PORT=false
VITE_GRAPHQL_ENDPOINT=http://127.0.0.1:3000/graphql
VITE_API_HEALTH_ENDPOINT=http://127.0.0.1:3000/health
VITE_API_READINESS_ENDPOINT=http://127.0.0.1:3000/health/readiness
```

启动前端：

```powershell
npm run dev:frontend
```

访问 `http://localhost:5173`。本地环境文件同样禁止提交。

## 9. 开始任务

每次从最新 `main` 创建短期分支：

```powershell
git switch main
git pull --ff-only
git switch -c feat/<page-or-scope>
```

只能推送功能分支并向 `main` 创建 PR，不得直接 push 或 force push `main`。页面任务按前端、GraphQL 契约、后端行为、权限和测试组成一个纵向切片，验收标准见 [任务验收标准](./task-acceptance.md)。

## 10. 常见问题

- API 启动时报 Redis 连接失败：确认本机 Redis 已启动且端口、DB 与 `.env.development` 一致。
- API 启动时报字段加密配置缺失：补齐 `FIELD_ENCRYPTION_KEY` 和 `FIELD_ENCRYPTION_IV`。
- Mock 账号密码正确但登录失败：确认 Seed 和 API 使用同一组字段加密 Key/IV，然后重新执行 `npm run seed:mock`。
- 浏览器出现 CORS 错误：确认 `APP_CORS_ORIGINS` 与前端实际地址完全一致。
- GraphQL 返回 `UNAUTHENTICATED`：Token 缺失、过期或无效，清理本地 Session 后重新登录。
- Migration 演练拒绝数据库名：只对个人空库操作，并使用包含 `test`、`drill` 或 `ci` 的库名。
