<!-- docs/stable-clean/decisions.md -->

# Stable Clean Decisions

本文件记录当前仓库中，与 `stable` 第二维治理相关的具体判定先例。

## 目标

- 沉淀真实边界案例
- 避免同类问题反复重判
- 让后续的人和 AI 可以直接参考仓库内既有结论

## 记录边界

- 禁止 AI 自行新增或虚构决策条目
- 本文件只记录人类开发者确认，或经过人工核实的真实重构结果
- 若当前问题尚未经过人工确认，不得以“先例”形式写入本文件

## 当前状态

## 001: Upstream Access 保留访问形态，不保留具体业务接口

### 场景

- 本分支从更大的项目中抽出，只需要保留 upstream 访问边界。
- 来源项目中存在多个具体 upstream 业务接口、业务目录访问示例和接口载荷加解密能力。
- 这些具体接口和加解密工具不属于本分支的通用前端基线。

### 判定

- `upstream access` 作为稳定访问能力进入 `entities/upstream-access`。
- 只保留前端持有 access token、按当前账号绑定存储、登录/刷新由外部 port 注入、滚动 token 持久化和失败恢复这类访问形态。
- 不保留任何具体 upstream 业务 query/mutation、接口载荷加解密能力或具体业务目录接口。

### 依据

- access token 生命周期与本地持有规则是稳定业务对象能力，适合放入 `entities`。
- 具体 upstream 业务接口应由未来拥有者 feature 或 lab 自己承接，不能下沉成通用 entity 默认能力。
- 接口载荷加解密属于具体协议/业务适配，不是这个极小分支的通用基线。

### 后续动作

- 未来新增 upstream 功能时，优先复用 `entities/upstream-access` 的 port 和 token 生命周期。
- 若需要调用具体 upstream 业务接口，应放在拥有它的 `feature/infrastructure` 或对应 `labs/<name>/api.ts` 内。
- 不得把具体接口再次回填到 `entities/upstream-access`。

## 002: 紧凑工具区保留原生 `<input>` / `<button>`（36px 几何例外）

### 场景

- 紧凑工具区 primitive（`src/shared/ui/toolbar-controls`）要求 36px 高 / 6px 圆角，与同排过滤条对齐；
  由知识库页（`/admin/document-database` 的四个标签，经 `shared/ui/knowledge-base` 薄包装）与
  独立资料页（`/reference-documents`，直接消费中性组件并注入 `.reference-library-*` 作用域类）共用，
  因 features 之间不得横向依赖、也不得依赖 widgets，只能落在 `shared`。
- AntD `Input` / `Button` 的内部包裹层会引入额外 DOM 与自身高度，在该几何下无法稳定达成 36px，
  且会改变已入库的视觉基线数值（`frontend/docs/gkj-visual-baseline.md` 第 6 节）。
- 该形态最初落在 `shared/ui/knowledge-base`，PR4 上提为跨页中性原语 `shared/ui/toolbar-controls`
  （知识库侧改为薄包装追加 `.kb-*` 覆盖层），PR5 只是复用它承载资料列表的工具区，并非本轮新引入。

### 判定

- 批准该窄例外：紧凑工具区的搜索框与工具按钮保留原生 `<input>` / `<button>`，不改用 AntD 控件。
- `ui-stack-rules.md`「AntD 拥有业务控件」在该作用域内不适用。

### 依据

- 36px 几何与配套 CSS 已是入库视觉基线，改用 AntD 需重跑 S1–S4/S6 视觉并改写基线数值，收益仅为控件来源统一。
- 例外边界清晰、可枚举：仅限 `shared/ui/toolbar-controls` 的 `ToolbarSearchField` 与 `ToolbarButton` 两个原语。
- 负责人于 2026-09-26 明确批准（PR5 原生紧凑控件例外裁决）；PR5 收口为消除同功能二次实现，
  已将原 `shared/ui/compact-controls` 合并回 PR4 的 `shared/ui/toolbar-controls`，例外对象随之迁移。
  此处不引用 `docs/plan/` 下的本地报告路径：该目录被根 `.gitignore` 忽略，
  写进本文件会在 fresh clone 中形成断链。

### 后续动作

- 本例外**不外溢**：新增其他原生控件不自动继承，需另行裁决并补记。
- 页面作用域类名继续由调用方注入（`.kb-search` / `.reference-library-search`），
  `toolbar-controls` 只输出中性基类，不内置业务页面名。
- 若未来 AntD 公开 API 能稳定达成同一几何，应优先迁移并同步更新视觉基线数值。
