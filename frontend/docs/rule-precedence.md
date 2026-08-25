<!-- docs/rule-precedence.md -->

# Rule Precedence

本文件是当前规则裁决主题的直接规则文档。

## 目标

本项目已经将结构、环境暴露、依赖、layout、UI、AI workflow、testing 等规则拆成多份文档。

当一个改动同时命中多份文档时，如果没有明确裁决顺序，最容易出现的问题是：

- 同一职责被不同文档重复解释
- 生成或修改代码时，不知道该优先遵守哪份规则
- 把专题规则误当成结构规则
- 把开放项文档误当成正式规则来源

本文件用于明确：

- 多份文档同时适用时，应先按哪类规则判断
- 哪些文档可以细化规则，哪些文档不能反向改写结构边界
- 真正发生冲突时，应如何给出最终结论

## 基本原则

- 只有在规则发生重叠、冲突或边界不清时，才使用本文件裁决
- 如果多份文档同时适用但并不冲突，则相关约束同时生效
- 本文件只负责裁决顺序，不替代各主题文档本身

## 裁决顺序

### 1. layer、environment 与 dependency 规则优先

当一个改动涉及目录归属、环境暴露、模块落位、导入方向、跨层引用时，优先遵守：

- [layer-model.md](./layer-model.md)
- [environment-exposure.md](./environment-exposure.md)
- [dependency-rules.md](./dependency-rules.md)

原因：

- 它们决定“代码应放哪一层”
- 它们决定“代码在哪些环境可见、是否允许进入生产”
- 它们决定“代码可以依赖谁”
- 其他专题文档不得改写这一层的基本边界

补充：

- 若代码已经明确属于 `stable`，再用 [stable-clean/architecture.md](./stable-clean/architecture.md) 判断它在切片内部是否需要第二维职责分层
- `stable-clean/architecture.md` 只能细化 `stable` 内部结构，不能改写 `layer-model`、`environment-exposure` 与 `dependency-rules` 的第一维边界

### 2. 主题规则只在自己的范围内细化

当结构归属已经明确后，再按具体主题文档细化实现方式。

例如：

- [layout.md](./layout.md) 负责 `app shell`、`main`、`Sidecar`、workspace 行为边界
- [infrastructure-rules.md](./infrastructure-rules.md) 负责 API、storage、URL 参数、SDK、mock 的收束规则
- [ui-stack-rules.md](./ui-stack-rules.md) 负责 `antd`、`@ant-design/x`、Tailwind 的分工
- [ui-design/README.md](./ui-design/README.md) 负责视觉质量、交互反馈和 AI 生成 UI 的专项约束
- [labs-rules.md](./labs-rules.md) 负责 `labs` 的 access、meta 与治理要求
- [sandbox-rules.md](./sandbox-rules.md) 负责 `sandbox` 的试验边界

这些文档可以细化规则，但不能把已经确定的 layer 归属、环境暴露或依赖方向重新改写。

### 3. AI workflow 负责“落点与迁移”，不负责结构归属

[ai-workflow.md](./ai-workflow.md) 主要回答：

- 当前改动更适合先进入 `stable`、`labs` 还是 `sandbox`
- 从 `sandbox` 到 `labs`
- 从 `labs` 到 `stable`

它不负责决定：

- 某段代码究竟属于 `pages`、`widgets` 还是 `features`
- 某个目录是否可以跨层依赖

也就是说：

- `ai-workflow` 可以决定“先落在哪个区”
- 但不能覆盖 `layer-model`、`environment-exposure` 和 `dependency-rules` 对区内结构与环境暴露的约束

### 4. project-convention 只做仓库内专题收敛

`docs/project-convention/` 下的文档用于沉淀当前仓库的专题约定，例如：

- [project-convention/graphql-error-model.md](./project-convention/graphql-error-model.md)
- [project-convention/graphql-ingress-auth-boundary.md](./project-convention/graphql-ingress-auth-boundary.md)
- [project-convention/upstream-access-frontend-ownership.md](./project-convention/upstream-access-frontend-ownership.md)

这类文档可以定义：

- 输入语义
- 时间语义
- 测试分组
- 仓库内局部工作流

但不得定义：

- layer 所有权
- 环境暴露语义
- 依赖方向
- `stable / labs / sandbox` 的基本边界

### 5. decision records 不是主要规则入口

例如 [stable-clean/decisions.md](./stable-clean/decisions.md) 只用于记录：

- 已经确认过的边界案例
- 当前局部规则的背景决策
- 少量需要保留的上下文

默认情况下：

- 不应把它当成主要规则来源
- 不应让它覆盖已经稳定的正式规则文档

只有当其中明确记录了已确认例外时，才可作为背景依据引用。

## 一句话判断法

当多份文档同时出现时，优先按下面顺序判断：

`layer / environment / dependency -> topic rule -> project convention -> decision record`

## 输出要求

如果某次判断真实使用了本文件完成裁决，输出中应明确说明：

- 使用了 `docs/rule-precedence.md`
- 哪几份文档存在重叠、冲突或边界不清
- 采用了哪一条裁决顺序
- 最终结论是什么
