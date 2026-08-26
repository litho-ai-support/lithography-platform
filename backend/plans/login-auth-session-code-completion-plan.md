<!-- 文件位置: backend/plans/login-auth-session-code-completion-plan.md -->

# 登录功能编码收尾阶段计划

## 文档定位

- 状态：P0 全部（P0-1 至 P0-4）代码已实施，开发检查全部通过，待独立验收
- 创建日期：2026-08-26
- 所属分支：`feat/login`
- 前置提交：`e076848`、`cb5830f`
- 作用：只记录当前登录功能剩余的代码工作，不执行项目验收

本计划以当前代码、`docs/development/task-acceptance.md` 和项目组提供的登录验收文档为依据。
稳定规则仍以 `docs/` 和各级 `AGENTS.md` 为准。本计划完成后必须停止，另行启动验收，不能在
本计划中顺带完成真实账号联调、截图、PR 证据或 CI 验收。

自动化测试文件属于代码交付的一部分，因此纳入本计划；人工操作、真实环境验证和 Review 不属于
本计划。

## 1. 当前实现结论

以下代码能力已经存在，本阶段必须复用，不得重新实现：

- 正式 `/login` 页面以及账号/邮箱、密码表单。
- 复用现有 `login(input: AuthLoginInput!): LoginResult!` 的公开 GraphQL 请求。
- 登录请求使用 `PASSWORD`、`SSTSWEB`、`authMode: none`，且不请求 refresh token。
- 单一 `auth-session` owner、`sessionStorage` 持久化和同标签页恢复。
- `accessToken`、`accountId`、`role` 和安全用户摘要的最小会话快照。
- Apollo `getAccessToken()` 接线和 Bearer token 注入。
- `SUPER_ADMIN`、`ENGINEER`、`CUSTOMER` 的默认入口、角色守卫和安全 `returnTo`。
- `/admin`、`/engineer`、`/customer` 三个临时登录结果页面。
- 退出时清理会话与 Apollo cache，并跳转 `/login`。
- `UNAUTHENTICATED` 的统一失效入口。
- 会话、storage、GraphQL gateway、错误映射、角色策略和退出用例的现有单元测试。

当前静态检查、格式检查、65 个 unit/component 测试、2 个 Chromium E2E 和生产构建均已通过。

## 2. 剩余代码缺口

### 2.1 明确功能缺口

项目组验收文档要求“登录失败后保留登录名，但清空密码”。当前
`frontend/src/features/auth-session/ui/login-form.tsx` 只在登录成功后清空密码，失败路径没有清空。

### 2.2 自动化代码缺口

- 没有组件测试证明失败后保留登录名、清空密码并允许再次提交。
- 没有组件测试证明网络失败时登录名仍然保留、错误可恢复且不会重复提交。
- 角色跳转的纯策略已有测试，但登录页面成功回调与路由接线缺少行为覆盖。
- 全局失效处理已有幂等标记，但没有测试证明多个并发 `UNAUTHENTICATED` 只执行一次退出和跳转。

## 3. 目标和非目标

### 3.1 目标

- 修正登录失败后的表单数据处理，使登录名保留、密码清空、提交状态恢复。
- 为登录表单、登录后跳转接线和全局失效幂等行为补齐最小自动化测试代码。
- 保持 page、router、Apollo 共用现有 `auth-session` owner，不增加第二份会话状态。
- 完成代码后只运行开发检查并停止，等待独立验收。

### 3.2 非目标

- 不执行三类真实账号的浏览器登录验收，不制作截图或录像。
- 不执行 PR、CI、Review 或 Merge 验收。
- 不修改后端 Resolver、Usecase、Entity、Migration、Seed 或 GraphQL schema。
- 不实现正式角色业务首页、注册、忘记密码、refresh token 或服务端 logout。
- 不实施通用导航改版、AI sidecar 改版或与登录无关的页面体验优化。
- 不新增另一套 GraphQL client、错误模型、session store 或路由事实源。
- 不引入第二套浏览器 E2E 框架；按后续明确要求仅使用 Playwright 承载最小登录浏览器链路。

## 4. 所属 capability 与涉及范围

- 后端 capability：继续复用 `identity.authentication`，不改变 capability 边界。
- Frontend：涉及 `features/auth-session`、登录页与必要的 `app/router`、`app/bootstrap` 测试接缝。
- Backend：不改代码。
- 数据库：不改 Entity、Migration、表和 Seed。
- GraphQL：不改 operation 契约，只复用当前 login gateway。
- 权限：不改变现有角色继承和路由策略。
- 文件上传：不涉及。

## 5. 每阶段共同规则

每个阶段开始前重新阅读：

- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/development/task-acceptance.md`
- `frontend/AGENTS.md`
- `frontend/docs/README.md`
- `frontend/docs/rule-precedence.md`
- `frontend/docs/layer-model.md`
- `frontend/docs/dependency-rules.md`
- `frontend/docs/infrastructure-rules.md`
- `frontend/docs/stable-clean/README.md`
- `frontend/docs/stable-clean/architecture.md`
- `frontend/docs/testing.md`
- `frontend/docs/project-convention/graphql-error-model.md`
- `frontend/docs/project-convention/graphql-ingress-auth-boundary.md`
- `backend/plans/README.md`
- 本计划

若 plan 与 docs 冲突，以 docs 为准并先报告冲突，不得自行扩大范围。

## 6. P0-1：修正登录失败后的表单状态

只修改现有登录表单的失败处理：

- 登录请求失败后保留 `loginName`。
- 清空 `loginPassword`，不得把失败密码继续留在表单、日志、URL 或反馈信息中。
- 恢复提交按钮和输入状态，允许用户立即重新输入密码并提交。
- 继续复用现有 `loginWithPassword` 和 `resolveLoginErrorMessage`。
- 成功路径、角色返回和路由回调语义保持不变。
- 不把 GraphQL 错误解析或业务判断移入 UI adapter。

本阶段产出仅为登录表单行为修正及对应的窄范围测试代码。

## 7. P0-2：补齐登录表单组件测试代码

开始前先确认现有 Vitest 能力；若缺少 DOM 渲染环境，只允许增加 Vitest 生态内最小的组件测试依赖，
不得引入新的测试框架或运行时状态库。

覆盖以下行为：

- 成功提交只调用一次既有登录用例，并把安全会话视图交给 `onAuthenticated`。
- 凭据错误时保留登录名、清空密码、显示安全提示并恢复再次提交。
- 网络或协议错误时保留登录名、提供可恢复反馈且不泄漏内部错误。
- 请求进行中时阻止重复提交。
- 空输入由现有 Ant Design 表单规则拦截，不调用登录用例。

测试通过 feature 现有边界替换依赖，不直接操作 sessionStorage，不复制 GraphQL 错误模型。

## 8. P0-3：补齐路由与全局失效处理测试代码

只为现有接线增加最小测试接缝，不改变功能语义：

- 覆盖登录成功后根据后端 role 进入统一默认入口。
- 覆盖安全 `returnTo` 被采用，非法或跨角色目标回退到当前角色默认入口。
- 覆盖未登录访问角色页、已登录访问 `/login` 和跨角色访问的现有路由接线。
- 覆盖多个并发认证失败只触发一次会话清理和登录跳转。
- 若模块私有函数无法测试，可在其 owner 内提取可注入依赖的窄函数；不得把路由、Apollo 和页面拆成
  各自维护会话的三套逻辑。

已有 `auth-session-policy.spec.ts` 已覆盖的纯策略不得重复测试；新增测试重点验证应用装配是否实际使用
这些策略。

## 9. P0-4：开发检查与停止点

完成上述代码后运行：

```bash
npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run test:e2e
npm --prefix frontend run build
```

本阶段只确认代码可格式化、可类型检查、可测试和可构建。命令通过后必须停止，不得继续执行：

- 三角色真实浏览器登录；
- 邮箱登录联调；
- 未登录、跨角色、刷新、退出和失效 token 的人工验收；
- 截图、录像、PR 描述、CI 或 Review 收口。

上述内容应在下一轮依据项目组验收文档单独执行并形成验收报告。

## 10. 风险与 followup

- 组件测试使用 Testing Library + jsdom，浏览器 E2E 使用 Playwright；依赖保持最小并进入 lockfile。
- Ant Design 组件在 DOM 测试环境中可能需要少量浏览器 API shim；shim 只能进入测试 setup。
- 路由 loader 读取的是唯一会话 store。为了测试而提取接缝时，不能建立第二个 React 或 router 会话源。
- 全局认证失效处理位于应用装配层；测试应注入 logout/navigation 依赖，不能让 shared GraphQL 反向依赖 feature。
- 登录页公共壳层、角色感知导航和 AI sidecar 体验不属于本次明确验收缺口；如负责人要求调整，另建计划。

## 11. 本计划完成后的下一步

本计划所有代码及自动化检查完成后，删除或归档已完成的推进计划，再单独建立或执行“登录功能验收清单”。
验收阶段以项目组文档为准，不再编写新的登录功能代码；发现缺陷时再回到独立修复阶段。
