<!-- docs/environment-exposure.md -->

# Environment Exposure

本文件定义 `stable / labs / sandbox` 在 `dev / test / prod` 中的暴露语义。

这里的“暴露”同时包含：

- 是否进入导航或可发现入口
- 是否注册或允许访问路由
- loader / guard 是否允许直达
- 是否可作为生产交付的一部分被长期保留

## App Env

应用环境由 `getAppEnv()` 读取：

- `VITE_APP_ENV=dev`：本地开发与人工调试
- `VITE_APP_ENV=test`：测试、E2E、CI 或可重复验证场景
- `VITE_APP_ENV=prod`：生产构建与正式交付

若未显式配置，Vite dev server 下默认视为 `dev`，其他构建默认视为 `prod`。

## Stable

`stable` 指 `src/app`、`src/pages`、`src/widgets`、`src/features`、`src/entities`、`src/shared`。

环境语义：

- `dev`：可见
- `test`：可见
- `prod`：可见

`stable` 是正式区。能进入 `stable`，就表示它可以进入生产；具体权限、菜单和业务开关由正式业务规则继续控制。

## Labs

`labs` 是可受控进入真实观察的实验发布区，不是开发垃圾桶，也不是正式区。

环境语义：

- `dev`：默认可暴露，方便开发和人工调试
- `test`：默认可暴露，方便自动化验证和回归检查
- `prod`：默认不暴露；只有写明 access list、owner、reviewAt、rollback 后，才允许按名单或开关受控暴露

关键规则：

- `labs` 进入 `prod` 必须是显式动作，不因文件存在自动进入生产
- access list 同时控制导航入口和路由直达，不只是隐藏菜单
- 未命中 access list 时，入口不可见，直接访问也必须失败或被重定向
- `labs` 必须可快速撤回
- `labs` 到期后必须复查，并给出删除、延期或迁入 `stable` 的结论

当前仓库的 `/labs/game-2048` 是 dev/test 示例，不进入 prod。

## Sandbox

`sandbox` 是开发和测试用的一次性原型区。

环境语义：

- `dev`：可暴露
- `test`：可暴露，用于验证原型行为或防止示例退化
- `prod`：禁止暴露

关键规则：

- `sandbox` 不进入生产
- `sandbox` 不进入正式菜单
- `sandbox` 不作为正式交付内容
- `stable` 与 `labs` 不得依赖 `sandbox` 实现
- 有价值的 `sandbox` 原型应重建为 `labs` 或整理后迁入 `stable`，不是原地毕业

当前仓库的 `/sandbox/playground` 是主题 token 调试台，仅在 dev/test 暴露；生产环境入口不可见，直达路由也会被 guard 挡回首页。

## Router 例外

`app/router` 是唯一允许读取 `labs` 与 `sandbox` 公开入口的正式区组合根。

这个例外只服务于：

- 路由注册
- 导航暴露控制
- loader / guard
- 环境隔离

它不代表其他 `stable` 模块可以依赖 `labs` 或 `sandbox`。
