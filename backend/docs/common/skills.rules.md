<!-- 文件位置： docs/common/skills.rules.md -->

Purpose: Define authoring and usage guardrails for reusable skills.
Read when: You are implementing, reviewing, or refactoring skill definitions and trigger descriptions.
Do not read when: Your task does not change skill authoring boundaries.
Source of truth: This file defines skill rules; code examples elsewhere must not override it.

# Skills 生成与使用建议

## 目标与定位

- Skills 用于固化重复操作。
- 目标是保证执行流程一致、可复用、可检索。
- 每个 Skill 只聚焦一个明确场景。
- 避免超大杂糅指令。
- 描述中必须包含触发条件，确保可被正确调用。

## 目录结构

- 根目录请根据 agent 的规定建立。
- trae 项目：`.trae/skills/`
- codex 项目：`~/codex/skills`
- 单个 Skill： <skill-name>/SKILL.md

## 命名规范

- 统一使用小写 + 短横线。
  例如 e2e-spec-toggle、layer-rule-review。
- 名称语义应直观表达用途，避免缩写或内部黑话。

## 文件格式

- 使用 YAML frontmatter + Markdown 正文。
- frontmatter 必须包含 name 与 description。
- description 需同时包含“做什么”与“何时触发”。
- 建议用英文。
- 长度控制在 200 字符内。

示例：

```markdown
---
name: 'e2e-spec-toggle'
description: 'Runs E2E by group or single file via test/run-e2e-group.js. Invoke when executing one spec, switching group, or running smoke with real provider toggles.'
---

# E2E Spec Toggle

## 何时使用

- 需要按分组执行 E2E（core / worker / smoke）时
- 需要单文件执行 E2E 并快速回归时

## 操作步骤

1. 单文件优先使用 npm run test:e2e:file -- <spec>。
2. 分组回归使用 npm run test:e2e:core / worker / smoke。
3. 真实 third-party smoke 仅在用户明确要求时执行。
```

## 内容建议

- 何时使用：明确触发场景与边界条件。
- 关键位置：给出文件路径与关键行范围。
- 操作步骤：编号步骤，避免含糊措辞。
- 示例：提供最小可执行的样例。
- 输出要求：描述期望结果与检查点。

## 使用流程

1. 在 .trae/skills 下创建新目录。
2. 编写 SKILL.md，补齐 frontmatter 与正文。
3. 复查描述是否包含触发条件与执行范围。
4. 对照实际工程结构，确保路径与命令可用。
