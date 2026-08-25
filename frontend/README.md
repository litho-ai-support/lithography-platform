<!-- README.md -->

# AIGC Friendly Frontend

## Start Here

For AI / Agent：先阅读 [docs/README.md](./docs/README.md)，再添加或调整代码。
如果改动涉及页面、组件或样式，还必须阅读 [docs/ui-design/README.md](./docs/ui-design/README.md)。
如果改动涉及颜色，还必须阅读 [docs/ui-design/colors.md](./docs/ui-design/colors.md)。

`aigc-friendly-frontend` 是一个可以独立运行和独立演进的 AIGC-friendly React 前端基线项目。
它也可以作为 [AIGC Friendly Backend](https://github.com/yoyobq/aigc-friendly-backend) 的配套前端起点。

本项目不以严格对齐某个后端实现为前提，也不承诺即插即用式的前后端联调。
当前目标是提供一个小而清晰、适合 AI 继续扩展的 React 前端基线：所有权清楚、边界明确、GraphQL 优先、规则文档可读，并且保留足够的运行时结构，让后续功能可以稳妥接入。

## 项目定位

这个项目优先作为独立前端基线存在：它提供稳定区、实验区、开发试验区、GraphQL runtime、视觉规则、AI sidecar 和适合 AI agent 阅读的规则文档。

本前端的治理思路：

- `stable` 借鉴 FSD 的 ownership 与依赖方向，但不追求纯粹 FSD，也不机械补齐目录
- 稳定代码按 `app / pages / widgets / features / entities / shared` 拆分
- 复杂稳定切片才在内部按需引入 `domain / application / infrastructure / ui`
- 实验能力放入 `labs`
- 一次性原型放入 `sandbox`
- GraphQL 访问统一经过 `src/shared/graphql`
- AI 交互 UI 与普通业务 UI 分离
- 只有在所有权和路由契约明确后，才加入具体业务页面或后端 adapter

## 当前范围

当前已经包含：

- React 19 + TypeScript + Vite
- React Router Data Mode
- Ant Design 作为业务 UI
- Ant Design X 作为 AI 交互 UI
- Tailwind 4 作为布局 wrapper 工具
- Apollo GraphQL client/runtime
- App shell、路由目录、本地 AI sidecar、labs、sandbox
- 可与后端 `UNAUTHENTICATED` 语义对齐的 GraphQL 入口错误模型
- 不包含具体 upstream 业务接口的通用 upstream access 生命周期
- 分层、依赖、基础设施、视觉、labs、sandbox、stable clean 拆分相关规则文档

## 快速开始

```bash
npm install
npm run dev
```

常用检查：

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run format:check
npm run build
```

较大的改动可以直接运行：

```bash
npm run check
```

## 环境变量

环境变量文件放在 `env/` 目录下。
完整示例见 `env/.env.development.example`、`env/.env.production.example` 和
`env/.env.e2e.example`。

本地配合 GraphQL API 或现有后端开发时，可以创建 `env/.env.development.local`：

```bash
VITE_APP_ENV=dev
VITE_GRAPHQL_ENDPOINT=http://127.0.0.1:3000/graphql
VITE_API_HEALTH_ENDPOINT=http://127.0.0.1:3000/health
```

没有后端时，前端仍然可以独立运行。当前 workbench 和本地 sidecar 不要求 live API。

## 目录结构

`stable` 不是单独目录，而是下面这组正式区目录。它的第一维接近 FSD 的职责切片，第二维只在复杂
`features` 或 `entities` 内按需出现。

```txt
src/
  app/       router、layout shell、providers、navigation truth
  pages/     路由级组合
  widgets/   页面级可复用 UI 块
  features/  用户动作与本地工作流
  entities/  稳定业务类型与生命周期模型
  shared/    通用基础设施和无明确业务归属的工具
  labs/      可控开启的生产实验
  sandbox/   仅用于开发和测试的一次性原型
```

## 环境暴露

环境暴露是本项目的核心设计之一：

- `stable`：`dev / test / prod` 都可见，是正式长期维护区。
- `labs`：默认只在 `dev / test` 暴露；若要进入 `prod`，必须显式配置 access list、owner、复查时间和撤回方式。
- `sandbox`：只允许 `dev / test` 暴露，禁止进入 `prod`。

入口可见性和路由直达都必须受同一套 guard 约束。详细规则见
[docs/environment-exposure.md](./docs/environment-exposure.md)。

## 开发规则

- 跨模块引用使用 public barrel。
- 稳定代码不依赖 `labs` 和 `sandbox`，只有 `app/router` 可以注册它们的公开路由。
- 业务 UI 使用 Ant Design 组件 API 和 token。
- AI 交互界面使用 Ant Design X。
- Tailwind class 放在 wrapper 元素上，不放在 Ant Design 组件主体上。
- 具体后端 API adapter 放在对应 feature 或 lab 中，不放进 `shared/graphql`。
- GraphQL 传输层行为保留在 `shared/graphql`。

## 视觉规则

前端不只要求功能可用，也要求页面结构、信息层级、交互反馈和深色模式保持一致。
涉及 UI 的改动先阅读 [docs/ui-design/README.md](./docs/ui-design/README.md)、
[docs/ui-design/ai-rules.md](./docs/ui-design/ai-rules.md) 和
[docs/ui-design/colors.md](./docs/ui-design/colors.md)。

## 可选后端配套

若与 [AIGC Friendly Backend](https://github.com/yoyobq/aigc-friendly-backend) 配套使用，后端提供 NestJS + GraphQL 框架基线、认证会话契约、账号与验证基础能力、AI/邮件异步队列，以及异步审计记录。

前端当前已经在 GraphQL 入口和错误模型上对齐以下契约：

- GraphQL endpoint 通过 `VITE_GRAPHQL_ENDPOINT` 配置
- 认证或会话失败通过顶层 GraphQL error 判断：
  `errors[].extensions.code === 'UNAUTHENTICATED'`
- `extensions.errorCode` 只作为诊断或细节信息，不作为生产分支契约
- HTTP `401` 只作为传输层 fallback
- 后续加入前端 auth refresh 时，应通过 `configureGraphQLRuntime` 注入到 `shared/graphql`

登录、session restore、refresh 等具体 auth feature 需要按业务 owner 继续接入；当前项目不把它们作为默认即插即用能力。
