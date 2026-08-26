<!-- 文件位置: backend/plans/login-auth-session-plan.md -->

# 登录、JWT 会话与角色落地页推进计划

## 文档定位

- 状态：进行中
- 创建日期：2026-08-25
- 当前阶段：P0-1 至 P0-4 已实施，待 Review
- 建议分支：`feat/login`
- 交付形态：登录纵向切片，一个 PR 完成主链路
- 主要范围：前端实现，复用现有后端 GraphQL 登录契约并完成真实联调

本文件只记录推进目标、范围、优先级、执行顺序、验收和待跟进事项，不定义稳定规则。稳定边界以 `docs/`、各级 `AGENTS.md` 和当前代码为准；若计划与规则或真实契约冲突，应先按规则裁决并更新计划，不得用本计划覆盖规则。

## 1. 目标和非目标

### 1.1 目标

- 基于现有 React、Apollo、NestJS、GraphQL 和 JWT 基础设施完成真实账号密码登录。
- 登录必须调用现有 `login(input: AuthLoginInput!): LoginResult!`，不得以 Mock、固定 token 或固定 role 代替联调。
- 建立前端最小 JWT 会话能力，使 Apollo 受保护请求自动携带 access token。
- 支持 `SUPER_ADMIN`、`ENGINEER`、`CUSTOMER` 三种角色，并按后端返回的当前角色自动跳转：
  - `SUPER_ADMIN -> /admin`，显示管理员临时落地页；
  - `ENGINEER -> /engineer`，显示工程师临时落地页；
  - `CUSTOMER -> /customer`，显示客户临时落地页。
- 三个页面明确显示当前身份和“登录成功”，让评审者能观察真实登录、会话建立和角色跳转结果。
- 未登录用户不能访问角色页；错误角色不能看到其他角色专属页面。
- 当前浏览器标签页刷新后会话仍有效；退出或 token 失效时清理会话与 Apollo cache，并返回登录页。
- 满足仓库登录专项验收、权限验证、测试和 PR 证据要求。

### 1.2 非目标

- 不实现三个角色的正式业务首页；临时页面只承接本次登录跳转验收。
- 不实现注册、忘记密码、短信/微信/第三方登录、修改密码或账号管理。
- 不新建 refresh token GraphQL 接口，不伪造自动刷新；没有稳定刷新 Mutation 时，token 失效后重新登录。
- 不修改账号、认证、JWT、角色或 capability 的稳定语义。
- 不新建、拆分、合并或重新分类后端 capability。
- 不修改 Entity、Migration、表、索引、外键、约束或现有 Seed。
- 不依赖 `DB_SYNCHRONIZE=true`。
- 不涉及文件上传、头像上传、对象存储或 `storage_backend`。
- 不处理与登录无关的依赖告警、审计告警或历史技术债。
- 不提交 `.env`、密钥、密码、token、真实数据、日志或构建产物。

## 2. 所属业务能力 / capability 判断

### 2.1 后端 capability

- 登录、token 签发和会话身份属于已接受的 `identity.authentication` capability。
- 登录结果中的账号与安全用户资料投影复用既有 `identity.account`，但本计划不改变二者边界。
- 不新增 capability anchor、manifest、runtime contribution、provider、队列、Worker 或通用 session registry。
- 若真实联调发现现有契约不能满足验收，只记录可复现缺口并交负责人确认是否扩大范围，不得自行改变 capability 语义。

### 2.2 前端 owner

- 登录动作、会话读写、当前身份和退出动作由一个稳定 owner 承担，建议为 `frontend/src/features/auth-session/`。
- 不拆为互相依赖的 `auth-login` 和 `auth-session` 两个 feature，避免 `features -> features`。
- `frontend/src/pages/login/` 只负责页面组合，不直接拥有 GraphQL、storage 或全局会话规则。
- 三个角色临时页进入正式 `pages`，因为它们属于主登录链路；不得放入 `labs` 或 `sandbox` 再让正式路由依赖。
- `app/router` 负责路由树、未登录守卫、角色守卫和跳转组合。
- `app/bootstrap` 或适合的应用级装配位置负责把会话 token 与认证失败处理接入既有 Apollo runtime。
- GraphQL 与 storage 适配收口在 feature 的 infrastructure 边界；状态宿主和用例编排按 stable-clean 规则放置。

## 3. 涉及范围

### 3.1 Frontend

- 登录表单、提交状态、错误反馈和基础可访问性。
- 单一 auth-session feature：登录、恢复会话、退出、当前角色和角色路由映射。
- 将 Apollo runtime 的 `getAccessToken` 从固定 `null` 接到当前会话。
- 全局 `UNAUTHENTICATED` 清理和跳转，避免重复通知与循环请求。
- 公共登录路由、受保护路由、角色守卫、已登录访问登录页处理。
- 管理员、工程师、客户三个临时落地页及退出入口。
- 按登录态和角色调整 layout/navigation，登录页不得暴露受保护入口。

### 3.2 Backend

- 预期不改后端业务代码，只核对并复用现有 Resolver、Usecase、JWT 和错误契约。
- 使用真实后端验证三种角色、错误凭据、禁用账号、token 失效和受保护请求。
- 若暴露后端缺陷，先形成复现证据；是否修复及是否同 PR 处理由负责人确认。

### 3.3 数据库

- 无结构修改、无 Migration、无已接受 Migration 编辑。
- 不新增 Seed；使用现有幂等 Mock Seed 的测试账号。
- 验收记录只能写账号标识或获取方式，不能记录真实密码。

### 3.4 GraphQL

- 复用 `login(input: AuthLoginInput!): LoginResult!`。
- 密码登录使用 `LoginTypeEnum.PASSWORD`；Web audience 从当前 schema 的既有枚举中选择，不私造值。
- login 请求显式使用无需认证模式，避免残留 token 污染。
- 只选择 `accessToken`、`accountId`、`role` 和必要的安全 `userInfo` 字段。
- P0 不请求、不消费、不持久化 `refreshToken`。
- 失败统一经过既有 GraphQL ingress error；会话失效只依赖 `errors[].extensions.code === 'UNAUTHENTICATED'`，不依赖调试字段 `extensions.errorCode`。

### 3.5 权限与会话

- 角色落地页由后端登录结果中的当前 `role` 决定，不由前端猜测。
- 未登录访问角色页时跳转登录页；只允许经过校验的站内 returnTo，禁止外站 URL。
- 已登录访问 `/login` 时跳到自己的角色页。
- 已登录访问其他角色专属页时不得显示目标内容；P0 默认跳回自己的页面，若 docs 或负责人要求统一 403，则按稳定规则调整。
- 退出时清理会话与 Apollo cache；token 无效时清理并重新登录，不调用不存在的 refresh API。
- access token 与最小身份摘要使用 `sessionStorage`；不使用 `localStorage`，不保存密码、refresh token、`metaDigest` 或完整敏感资料。

### 3.6 文件上传

- 本次完全不涉及文件上传。
- 页面如需图形，只使用仓库已有静态资产或图标组件，不引入上传接口、上传表单或存储依赖。

## 4. 必须遵守的 docs 规则文件

### 4.1 每个阶段开始前的共同阅读门槛

P0、P1、P2 每个阶段开始前都必须重新确认：

- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/development/task-acceptance.md`
- `frontend/AGENTS.md`
- `frontend/docs/README.md`
- `backend/AGENTS.md`
- `backend/docs/README.md`
- `backend/plans/README.md`
- 本计划

### 4.2 前端最小适用规则集

- `frontend/docs/rule-precedence.md`
- `frontend/docs/layer-model.md`
- `frontend/docs/dependency-rules.md`
- `frontend/docs/infrastructure-rules.md`
- `frontend/docs/stable-clean/README.md`
- `frontend/docs/stable-clean/architecture.md`
- `frontend/docs/stable-clean/checklist.md`
- `frontend/docs/navigation.md`
- `frontend/docs/layout.md`
- `frontend/docs/testing.md`
- `frontend/docs/environment-exposure.md`
- `frontend/docs/project-convention/graphql-error-model.md`
- `frontend/docs/project-convention/graphql-ingress-auth-boundary.md`
- `frontend/docs/ui-stack-rules.md`
- `frontend/docs/ui-design/README.md`
- `frontend/docs/ui-design/colors.md`

### 4.3 后端契约与 capability 规则集

- `backend/docs/common/rule-precedence.rules.md`
- `backend/docs/common/capability.rules.md`
- `backend/docs/capabilities/current.md`
- `backend/docs/api/graphql-error-contract-current.md`
- `backend/docs/api/auth-session-current.md`
- `backend/docs/api/adapters.rules.md`

### 4.4 当前契约核对入口

- `backend/src/schema.graphql`
- `backend/src/adapters/api/graphql/auth/auth.resolver.ts`
- `backend/src/adapters/api/graphql/auth/dto/auth-login.input.ts`
- `backend/src/adapters/api/graphql/account/dto/login-result.dto.ts`
- `backend/src/usecases/auth/login-with-password.usecase.ts`
- `backend/src/adapters/api/graphql/guards/roles.guard.ts`
- `backend/src/core/account/policy/role-access.policy.ts`
- `frontend/src/app/router/index.tsx`
- `frontend/src/app/bootstrap/graphql-runtime.ts`
- `frontend/src/shared/graphql/client.ts`
- `frontend/src/shared/graphql/errors.ts`
- `frontend/src/app/navigation/catalog.ts`

## 5. 当前已有实现盘点

### 5.1 必须复用

- 后端已有账号密码 login Mutation 和 `LoginWithPasswordUsecase`，不新增第二套 Resolver/Usecase。
- 登录输入已有 `loginName`、`loginPassword`、`type`、可选 `ip`、`audience`。
- 登录输出已有 access token、refresh token、accountId、role 和脱敏 userInfo。
- 后端角色固定为 `SUPER_ADMIN`、`ENGINEER`、`CUSTOMER`，并已有 JWT Guard、Roles Guard、会话校验和 GraphQL 错误契约。
- 前端已有 Apollo client、endpoint 配置、Authorization header 注入入口和 `GraphQLIngressError`。
- 前端已能将 `UNAUTHENTICATED` 识别为 auth 错误。
- 前端已有 React Router Data Mode、AppLayout、导航目录和 403/404/500 反馈组件。
- Migration 空库演练和 14 表 Mock Seed 已通过；真实工程师登录已人工验证。

### 5.2 当前缺口

- 前端没有登录页和真实 login Mutation 调用。
- 没有统一认证会话 owner、状态宿主和安全持久化。
- Apollo runtime 的 `getAccessToken` 固定返回 `null`。
- 没有未登录守卫、角色守卫、角色跳转和退出动作。
- 没有三类角色临时落地页。
- 当前导航仍是通用示例，未按登录态和角色收口。
- 后端虽有 refresh/logout usecase 文件或 token 字段，但 schema 没有本前端可调用的稳定 refresh/logout Mutation。

### 5.3 禁止重复实现

- 不新增第二套 GraphQL client、fetch wrapper 或错误模型。
- 不在 page 中直接读写 token，不让三个角色页各自维护会话。
- 不在前端验证密码、推导角色或复制后端角色继承来替代服务端授权。
- 不新增后端登录 DTO、Resolver、Usecase、JWT 签发器或账号表。
- 不用 Mock 登录、查询字符串角色、固定 token 或固定 role 绕过接口。

## 6. P0：打通可验收主链路

P0 不完成会阻塞本次交付。按 `P0-1` 至 `P0-7` 顺序推进，每项开始前执行相应阅读门槛。

### P0-1：冻结契约与验收样例

开始前阅读：共同门槛、后端 GraphQL error/auth/session 文档、schema、登录 Resolver 和 DTO。

推进内容：

- 确认 login 输入、输出、枚举和错误表现。
- 确认浏览器 audience，不发明枚举值。
- 从现有 Seed 确认三类测试账号，记录不含密码的账号标识。
- 明确会话最小字段与禁止持久化字段。
- 固定角色到 `/admin`、`/engineer`、`/customer` 的映射。

阶段验收：

- 三种角色都有可复现测试账号并能返回正确 role。
- 前端字段选择与 schema 一致，不依赖 refresh token 或调试错误字段。
- 后端 schema、数据库和 Seed 无修改。

#### P0-1 已确认基线（2026-08-26）

- 浏览器密码登录使用现有 `LoginTypeEnum.PASSWORD` 与 `AudienceTypeEnum.SSTSWEB`。
- 登录响应的最小会话字段冻结为 `accessToken`、`accountId`、`role`，以及可空的安全
  `userInfo { nickname accessGroup }`；不请求或持久化 `refreshToken`、`metaDigest`。
- 角色默认入口冻结为：`SUPER_ADMIN -> /admin`、`ENGINEER -> /engineer`、
  `CUSTOMER -> /customer`。
- 无密码测试账号标识：
  - `mock_super_admin`（accountId `900001`，`SUPER_ADMIN`）；
  - `mock_engineer_chen`（accountId `900101`，`ENGINEER`）；
  - `mock_customer_alpha`（accountId `900201`，`CUSTOMER`）。
- Mock 密码继续只从本地 `MOCK_SEED_PASSWORD` 读取，不写入本计划、代码或测试。
- 登录失败与会话失效继续复用既有 GraphQL error contract；运行时会话失效只认
  `errors[].extensions.code === 'UNAUTHENTICATED'`。

### P0-2：建立单一 auth-session owner

开始前阅读：共同门槛，以及 frontend layer、dependency、infrastructure、stable-clean 和 ingress auth 规则。

推进内容：

- 建立 feature 公共 API，承载登录用例、会话快照、当前角色、退出和路由解析。
- 把纯会话判断、角色映射、returnTo 校验与 React 状态宿主分离。
- 建立 sessionStorage 适配并在应用启动时恢复同标签页会话。
- 损坏数据、字段缺失、未知角色或空 token 一律清除并视为未登录。
- page、router 和 Apollo runtime 共享同一会话事实来源。

阶段验收：

- 页面不直接操作 storage，shared 不依赖业务 feature。
- 异常快照不会造成崩溃或进入受保护页面。
- 密码、refresh token、`metaDigest` 和完整敏感资料未写入 storage。

### P0-3：接入真实登录 GraphQL

开始前阅读：共同门槛、GraphQL error model、ingress auth boundary、后端 auth/session current 和 adapter rules。

推进内容：

- 在 auth-session infrastructure 定义 login operation 和传输映射。
- login 显式使用无需认证模式，清除残留 Authorization。
- 将成功结果映射为安全会话快照，不请求 refresh token。
- 复用现有 GraphQL ingress error 映射，不建立平行错误模型。

阶段验收：

- 网络面板可见真实 POST `/graphql`，成功结果来自后端。
- 错误密码不建立会话，允许再次提交。
- 网络或协议错误不显示堆栈、token 或后端内部信息。

### P0-4：完成登录页面

开始前阅读：共同门槛、UI stack、UI design、colors、layout 和 testing。

推进内容：

- 用 Ant Design 完成账号、密码、提交和反馈；Tailwind 只用于 wrapper。
- 支持键盘提交、autocomplete、明确 label、必填校验、loading 和重复提交保护。
- 密码默认不可见，不进入日志、URL、错误文案或截图。
- 成功后立即按后端 role 跳转；已有会话进入登录页时跳往自己的页面。

阶段验收：

- 三类账号均可从同一页面提交。
- 空输入、错误密码、后端不可用都有可理解且可恢复反馈。
- 深浅主题可读，无新增局部硬编码颜色。

### P0-5：路由守卫与三个角色临时页

开始前阅读：共同门槛、navigation、layout、environment exposure、dependency rules 和 task acceptance。

推进内容：

- 组合公共登录路由和三个受保护角色路由。
- 未登录直达时跳 `/login`；returnTo 只接受安全站内路径。
- 跨角色访问不得渲染目标页面，默认回到自己的页面。
- 管理员页显示“管理员页面”、`SUPER_ADMIN`、登录成功和安全用户摘要。
- 工程师页显示“工程师页面”、`ENGINEER`、登录成功和安全用户摘要。
- 客户页显示“客户页面”、`CUSTOMER`、登录成功和安全用户摘要。
- 三页提供退出入口，不展示密码、token 或敏感字段。
- 页面位于 stable `pages`，不虚构业务统计或接口数据。

阶段验收：

- 三种角色登录后分别自动进入正确页面。
- 刷新后保留同标签页会话，且不闪现其他角色内容。
- 未登录直达和跨角色直达都看不到受保护目标内容。
- 后退、前进和手动 URL 不能绕过守卫。

### P0-6：Apollo JWT、失效处理与退出

开始前阅读：共同门槛、ingress auth boundary、GraphQL error contract 和 Apollo runtime 实现。

推进内容：

- Apollo token 获取器接入单一会话来源。
- 受保护请求携带 Bearer token，login 请求不携带残留 token。
- `UNAUTHENTICATED` 幂等触发会话清理、Apollo cache 清理和登录跳转。
- logout 清本地状态与缓存后跳登录页，不调用不存在的后端 Mutation。
- 防止多个并发失败造成重复提示或循环跳转。

阶段验收：

- 有效 token 的受保护请求通过；篡改或过期 token 会安全退回登录页。
- 退出后浏览器后退不能恢复受保护数据。
- 切换账号不会看到上一账号的 Apollo 缓存。

### P0-7：真实联调、测试与 PR 证据

开始前阅读：共同门槛、frontend testing、task acceptance、PR 模板和 CONTRIBUTING。

推进内容：

- 补齐主链路必要的单元测试和路由测试。
- 使用真实 MySQL、Seed、后端和前端验证三类角色。
- 执行前后端最小充分检查、测试和构建。
- 形成不含秘密的复现步骤、账号标识、预期结果和三类角色页面截图。
- 提交前检查 diff，排除 `.env`、token、密码、日志、数据库文件和构建产物。

阶段验收：

- P0 场景、测试和构建全部通过。
- 三类角色真实登录与跳转均有复现证据。
- PR 准确说明 frontend、GraphQL、backend、权限、数据库影响和验证结果。
- 数据库影响明确为“不涉及 Entity/Migration”。

## 7. P1：主链路后的尽早补强

P1 不阻塞最小登录展示，但主链路稳定后应尽早完成。

### P1-1：补强自动化边界测试

开始前重新阅读：共同门槛、frontend testing、GraphQL error model 和 ingress auth boundary。

推进内容：

- 覆盖快照解析、损坏数据、角色映射和安全 returnTo。
- 覆盖三角色成功、错误凭据、网络失败、重复提交和未知角色。
- 覆盖未登录、跨角色、已登录访问登录页、刷新恢复、退出清缓存。
- 若仓库已有浏览器测试基础设施则增加浏览器级覆盖；否则不擅自引入大型框架，转 followup。

阶段验收：

- 关键纯逻辑和路由边界有自动回归保护。
- 测试不依赖真实密钥，不把 Seed 密码提交到仓库。
- 失败可定位到登录、会话、路由或角色边界。

### P1-2：角色感知导航与体验收口

开始前重新阅读：共同门槛、navigation、layout、UI stack 和 UI design。

推进内容：

- 导航只显示当前角色可到达的稳定入口。
- 登录页采用公共壳层，不显示受保护导航或无意义 AI sidecar。
- 统一登录失败、会话失效、无权限和退出反馈。
- 检查焦点、错误关联、loading、密码管理器和窄屏布局。

阶段验收：

- 导航与直达权限一致，不出现“隐藏菜单但 URL 可访问”。
- 登录、退出和失效无闪烁、死循环或重复通知。
- 键盘与常见屏幕尺寸下能完成登录和退出。

## 8. P2：等待需求或契约稳定

### P2-1：临时角色页替换为正式业务首页

开始前重新阅读：共同门槛，以及对应角色业务届时适用的 frontend、backend、GraphQL 和权限 docs。

推进内容：

- 分别确认管理员、工程师、客户正式首页需求和 owner。
- 按纵向切片接入真实 GraphQL、后端权限、加载态、空态和错误态。
- 只有正式页面验收通过后才删除或替换临时页。

阶段验收：

- 每个正式首页都有已批准目标和独立验收范围。
- 占位文案清理，页面不使用虚构数据。

### P2-2：评估 refresh token 与服务端退出

开始前重新阅读：共同门槛、后端 auth/session、GraphQL error、capability rules 和届时 schema。

推进内容：

- 由负责人确认是否需要静默续期、rotation、服务端撤销和多端退出。
- 若需要，先确定稳定 GraphQL 契约、存储方式、CSRF/XSS 和失效语义，再建独立计划。
- 不把现存但未暴露的 refresh/logout usecase 当作可用 API。

阶段验收：

- 只有后端稳定接口和安全策略明确后才实现。
- refresh 失败仍遵守统一 `UNAUTHENTICATED` 语义。
- 稳定结论进入 docs，不长期留在本计划。

## 9. 总体验收标准

- 使用真实前后端和数据库 Seed 登录，不使用前端 Mock。
- 三种角色分别进入正确的管理员、工程师、客户页面。
- 页面能证明登录成功和当前角色，且不泄露 token、密码或敏感字段。
- 未登录和跨角色访问均不能看到无权页面。
- 刷新保留同标签页会话；退出和 token 失效清理会话与 Apollo cache。
- login 不携带旧 token，受保护请求正确携带 access token。
- 错误密码、禁用账号、网络错误、GraphQL 错误和失效 token 均可恢复。
- 相关检查、测试和构建通过。
- 无数据库、Seed、文件上传变化。
- diff 和 PR 中无环境文件、密钥、密码、token、真实数据、日志或构建产物。

## 10. 测试计划

### 10.1 前端单元测试

- 三种 role 到目标路由映射及未知值。
- 会话快照序列化、恢复、清理和损坏容错。
- 安全 returnTo：允许站内路径，拒绝外站、协议相对地址和异常值。
- 成功写会话，失败不写会话。
- logout 清理会话和 Apollo cache。
- `UNAUTHENTICATED` 全局处理幂等。

### 10.2 路由与 UI 测试

- 未登录打开 `/admin`、`/engineer`、`/customer`。
- 三类角色登录自动跳转。
- 三类角色访问另外两类页面。
- 已登录访问 `/login`。
- 刷新、后退、退出后后退。
- 空输入、错误密码、重复点击、后端离线和 malformed 响应。
- 密码输入、loading、错误消息和键盘提交。

### 10.3 后端契约回归

- 对现有 login Mutation 做窄范围真实调用。
- 三类账号返回 role 与 Seed 一致；错误凭据不返回 token。
- 会话失败稳定信号为 `extensions.code === 'UNAUTHENTICATED'`。
- 验证 `SUPER_ADMIN` 访问后续受保护接口的继承行为；若 Roles Guard 与 capability/current 不一致，记录为阻塞风险并交负责人裁决。

### 10.4 建议命令

前端：

```bash
npm run format:check
npm run lint
npm run test:unit
npm run build
```

后端未改代码时执行真实登录的窄范围验证；如有后端改动：

```bash
npm run typecheck
npm run test:unit
npm run build
```

如改动后端 E2E，优先：

```bash
npm run test:e2e:file -- <相关测试文件路径>
```

### 10.5 人工证据

- 三类角色各自的登录后页面和刷新后状态。
- 错误密码反馈。
- 未登录直达角色页的跳转。
- 跨角色直达被拒绝。
- 退出后无法返回受保护内容。
- 截图和 PR 描述遮蔽密码、token、Authorization、`.env` 和其他密钥。

## 11. 风险

- 后端返回 refresh token，但没有稳定的 refresh/logout GraphQL Mutation；P0 只能在失效后重新登录。
- sessionStorage 中 token 仍有 XSS 风险，页面不得注入不可信 HTML。
- Router loader 与 React provider 生命周期不同，直接强耦合容易形成双会话源。
- 并发请求可同时收到 `UNAUTHENTICATED`，清理和跳转必须幂等。
- Roles Guard 当前按 accessGroup 直接匹配，而 docs 声明 `SUPER_ADMIN` 继承其他角色；必须用真实受保护接口核验 accessGroup 是否展开。
- AppLayout/导航来自通用示例，调整登录壳层时不能破坏 labs、sandbox 和 AI sidecar 的环境边界。
- 临时角色页若无退出条件可能长期成为无 owner 占位页，需由 P2 后续业务计划接管。
- 测试密码写入代码、文档或截图会违反安全规则。
- 前端对登录响应 `userInfo` 形状从严校验，后端若调整其形状，登录会以 `malformed` 失败；放宽前必须先复核并冻结契约。
- schema、docs 与运行时不一致时必须按规则裁决，不能由前端静默兼容猜测契约。

## 12. Followup 与收口

主链路完成后，只把真实未完成尾项移入 `login-auth-session-followup.md`，并写明阻塞原因、触发条件、owner 和下一步。候选项：

- 三类正式首页需求未确定。
- refresh、rotation、服务端 logout 或多端撤销未批准。
- 仓库缺少浏览器测试基础设施。
- `SUPER_ADMIN` 继承与实际受保护接口不一致。
- 负责人决定跨角色访问统一显示 403。

已完成记录、稳定规则副本、无触发条件的设想和无关技术债不得进入 followup。

计划完成后：

1. 新确认的稳定边界进入对应 docs 并单独评审。
2. 有明确触发条件的尾项进入 followup。
3. 有保留价值的背景按 `backend/plans/README.md` 归档到 `backend/docs/deprecated/`，否则删除本计划。
4. 从计划索引移除本计划。

## 13. 完成定义

只有 P0 全部通过、三角色真实登录可复现、测试与构建通过、PR 证据完整且无秘密泄漏，主链路才算完成。P1 可作为紧随其后的补强；P2 必须等待前置需求或后端契约明确，不得借本计划提前扩展范围。
