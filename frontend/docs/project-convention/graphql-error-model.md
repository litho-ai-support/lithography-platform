<!-- docs/project-convention/graphql-error-model.md -->

# GraphQL Error Model

本文件定义当前项目里 `shared/graphql` 的基础设施错误模型。

## 当前结论

- `shared/graphql` 对外统一抛 `GraphQLIngressError`
- top-level GraphQL `errors`、HTTP 错误、网络错误与 malformed response 进入该模型
- payload 内部的 `success: false`、`reason`、`message` 属于业务结果，由拥有它的 feature/lab 解释
- 页面和 feature 不直接依赖 Apollo 原始异常形状

一句话约束：

- transport failure 用 `GraphQLIngressError`
- domain failure 用显式结果
- application flow 自己推进

## 错误分类

`GraphQLIngressError.type` 固定为 5 类：

- `network`
- `http`
- `graphql`
- `auth`
- `malformed`

约束：

- 不把业务 payload failure 归入 `GraphQLIngressError`
- 不因为接口同样走 GraphQL，就把业务失败误归到 `graphql`
- `auth` 只表示请求层识别到当前鉴权不可用，不直接决定页面如何跳转

## 默认用户提示

默认提示只作为兜底，具体业务可以覆盖：

- `network`: 网络连接异常，请稍后重试。
- `http`: 服务暂时不可用，请稍后重试。
- `graphql`: 请求处理失败，请稍后重试。
- `auth`: 登录状态已失效，请重新登录后再试。
- `malformed`: 返回结果异常，请稍后重试。

## Apollo 4.x 映射

当前按 Apollo Client 4.x error class 归一：

1. `CombinedGraphQLErrors`
   - 若含 `extensions.code === 'UNAUTHENTICATED'`，或兼容旧 message `TOKEN_INVALID` / `TOKEN_INVALID_AFTER_REFRESH`，归入 `auth`
   - 其他归入 `graphql`
2. `ServerError`
   - HTTP `401` 归入 `auth`
   - 其他归入 `http`
3. `ServerParseError`
   - 非 2xx 归入 `http`
   - 2xx 归入 `malformed`
4. `TypeError` / `AbortError`
   - 归入 `network`
5. 其他未知错误
   - 归入 `graphql`

## 结构

稳定字段包括：

- `type`
- `statusCode?`
- `operationName?`
- `graphqlErrors?`
- `isRetryable`
- `cause?`
- `userMessage`

`isRetryable` 只表达基础设施视角是否值得重试：

- `network`: `true`
- `http`: `statusCode >= 500`
- 其他类型：`false`

## 分层关系

- `shared/graphql` 负责 transport/runtime 错误归一
- feature/lab 负责解释业务 payload
- app/router/layout 决定路由级失败如何展示或跳转
