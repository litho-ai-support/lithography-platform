<!-- docs/project-convention/upstream-access-frontend-ownership.md -->

# Upstream Access Frontend Ownership

本文件记录当前项目对 upstream access 的前端主权约定。

## 当前结论

当前分支只保留 upstream access 的通用访问形态：

- 前端可以收集访问 upstream 所需凭据
- 前端把凭据提交给拥有该能力的后端或 feature adapter
- 后端或 adapter 返回 upstream access token 与过期时间
- 前端按当前本站账号绑定保存 upstream access token
- 后续请求由具体 feature/lab 决定如何把 token 传给自己的 adapter

一句话：

- `upstream access` 的生命周期在前端
- 具体 upstream 业务接口不属于通用 access entity

## 不保留的内容

本分支明确不保留：

- 具体 upstream query/mutation
- 具体业务目录、查询或流程接口
- 接口载荷加密、解密、调试或 payload crypto 工具
- 把 upstream token 并入本站 auth session 的做法
- 把 upstream 用户名、密码或 token 默认交给本站后端持久化保存的做法

## 当前代码归属

- `entities/upstream-access` 是 upstream access token 生命周期的公共入口
- 它只暴露 port、hook、storage 与 rolling token helper
- 它不直接定义任何具体 GraphQL operation
- 它不承接任何具体 upstream 业务 DTO

具体业务接口落点：

- 稳定业务：`src/features/<feature>/infrastructure/`
- 实验能力：`src/labs/<name>/api.ts` 或 `src/labs/<name>/infrastructure/`
- 原型能力：`src/sandbox/<name>/api.ts`

## Storage 规则

固定规则：

- 存储至少包含 `accountId` 与 `upstreamAccessToken`
- token 只归属于当前本站 `accountId`
- 若切换本站账号，本地残留的旧账号 token 必须失效并清空
- 可记录 `expiresAt`、`upstreamLoginId` 这类辅助信息
- 不默认保存 upstream 密码；若未来确需 remember credentials，必须另行评审

## Rolling Token

如果某个业务请求返回新的 upstream access token：

- 非空 token 应覆盖本地旧 token
- 新的 `expiresAt` 应同步保存
- 返回为空时保留本地已有 token

## Keep Alive

需要长时间使用 upstream access 的页面可以启用 keepAlive：

- 默认在过期前一段时间调用 injected refresh port
- refresh 失败时清空本地 token
- 页面应回到重新授权状态，而不是继续用旧 token 重试

## 给后续 AIGC 的约束

后续生成 upstream 相关功能时默认遵守：

- 复用 `entities/upstream-access` 管 token 生命周期
- 不在 entity 内新增具体 upstream 业务接口
- 不新增 payload crypto、接口载荷加解密或私有调试工具
- 具体接口先找拥有者，放在 feature/lab/sandbox 自己的 infrastructure 内
- 若后端新增不同 token contract，只在 `entities/upstream-access` 扩展通用生命周期，不把具体业务接口带进来
