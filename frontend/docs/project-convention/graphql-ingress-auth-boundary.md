<!-- docs/project-convention/graphql-ingress-auth-boundary.md -->

# GraphQL Ingress Auth Boundary

本文件定义当前项目里 GraphQL 共享入口与未来 auth 能力的职责边界。

## 当前结论

- 所有 GraphQL 请求统一走 `src/shared/graphql`
- `shared/graphql` 负责 endpoint、header 注入、Apollo client、统一错误模型和可选 reactive refresh
- 当前极小分支不内置完整 auth feature
- 若未来新增 auth feature，`login / refresh / restore / logout` 主流程仍应由 auth feature 自己掌管

一句话约束：

- `shared/graphql` 统一请求入口
- auth 主流程不下沉到 `shared/graphql`

## 请求语义

`executeGraphQL()` 支持两类请求：

### Protected request

- 默认语义
- 从 runtime bridge 的 `getAccessToken()` 读取 token 并注入 `Authorization`
- 若请求显式传入 `accessToken`，优先使用该 token

### Public request

- 显式传入 `authMode: 'none'`
- 不带默认 `Authorization`
- 不触发 reactive auth retry

典型 public request：

- 登录
- 注册或公开验证
- 不依赖当前用户身份的公开查询

## Runtime Bridge

`shared/graphql` 只暴露运行时桥接点：

```ts
configureGraphQLRuntime({
  getAccessToken: () => string | null,
  refreshSession: async () => void,
  onAuthFailure: () => void,
});
```

约束：

- `getAccessToken` 只读取当前真源，不维护另一份 token 状态
- `refreshSession` 由未来 auth feature 或 app bootstrap 注入
- `onAuthFailure` 只宣布 auth failure，具体跳转由 app/router/layout 决定
- auth 主流程请求必须使用 `authMode: 'none'` 或 `allowAuthRetry: false`，避免 refresh 套娃

## Reactive Refresh

普通 protected request 遇到 `GraphQLIngressError.type === 'auth'` 时：

1. 若 `authMode === 'none'` 或 `allowAuthRetry === false`，直接抛错
2. 若 runtime 没有注入 `refreshSession`，直接抛错
3. 调用一次 `refreshSession`
4. 成功后重放原请求一次
5. 失败后调用 `onAuthFailure`，再抛出原始 ingress error

约束：

- 只重试一次，不循环
- 重放时清除显式 `accessToken`，让 runtime 读取刷新后的 token
- `shared/graphql` 不决定登录页、redirect 或 toast

## 与 Upstream Access 的关系

本站 auth token 与 upstream access token 是两套会话。

- 本站 auth token 只用于访问本站 GraphQL API
- upstream access token 只作为业务请求参数或 feature-owned adapter 输入
- upstream access token 不进入 `shared/graphql` 的默认 `Authorization`
- upstream access 生命周期由 `entities/upstream-access` 承接
