<!-- docs/dependency-rules.md -->

# Dependency Rules

本文件是当前依赖规则主题的直接规则文档。

## 正式区依赖方向

- `pages -> widgets, features, entities, shared`
- `widgets -> features, entities, shared`
- `features -> entities, shared`
- `entities -> shared`
- `shared -> 不依赖业务层`

## 补充规则

- `labs` 只允许依赖 `shared`，必要时可依赖 `entities` 的公开内容
- `labs` 默认不得依赖 `pages`、`widgets`、`features`
- 如确有必要，必须在该 `labs` 模块的 `meta.ts` 中声明 `exception`
- `sandbox` 只允许依赖 `shared`，必要时可有限依赖 `entities` 的公开内容做验证
- `sandbox` 默认不得依赖 `pages`、`widgets`、`features`
- `sandbox` 和 `labs` 都不得依赖正式区私有实现
- 正式区不得依赖 `sandbox`
- 正式区不得依赖 `labs`
- 当前已人工确认 `app/router` 可依赖 `labs` 与 `sandbox` 的公开入口，仅用于路由注册与入口治理

## 规则执行方式

- 依赖方向：由 ESLint 的 `boundaries` 插件自动检查
- 深层 import 与公开出口约束：由 ESLint 的 `no-restricted-imports` 规则检查
- `exception`：必须人工确认后才能写入 `meta.ts`，ESLint 不会自动根据 `exception` 放行
- 其余尚未工程化的规则，当前仍以文档约束和人工评审为主

## 公开 API

- 跨模块导入只允许走公开 API，例如 `index.ts`
- 文件存在且可被 import，不等于它是公开 API
- 直接引用其他模块内部文件，视为违规

示例：

- 合法：`import { UserCard } from '@/entities/user'`
- 违规：`import { UserCard } from '@/entities/user/ui/UserCard'`

## 人工例外提醒

- ESLint 负责拦截默认违规依赖
- ESLint 不会自动根据 `labs/<name>/meta.ts` 中的 `exception` 放行
- 真实例外必须先人工确认，再写入对应 `meta.ts`
- 不允许通过深层 import、相对路径或关闭规则来绕过
- `app/router` 接入 `labs` / `sandbox` 已作为当前人工确认例外落地；其他正式区模块仍不得依赖它们
- `app/` 作为全局壳层域，内部子目录可相互协作；但仍应优先通过 `@/app/<module>` 这类公开出口导入，避免继续扩散深层路径依赖
