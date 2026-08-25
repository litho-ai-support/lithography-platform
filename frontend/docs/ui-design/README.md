<!-- docs/ui-design/README.md -->

# UI Design Docs

本目录是前端视觉规则的专项入口。

`ui-stack-rules.md` 负责说明 Ant Design、Ant Design X、Tailwind 各自负责什么；本目录负责说明页面和组件应该呈现成什么样，以及 AI 生成 UI 时需要避开的常见问题。

## 什么时候必须阅读

只要改动涉及以下内容，先读本目录：

- 页面、组件、表单、列表、卡片、空状态、错误状态
- AI sidecar、AI 对话、prompt 输入、生成结果展示
- 颜色、圆角、阴影、间距、排版、图标、层级
- 深色模式、响应式布局、hover / focus / loading 反馈
- 任何“只是样式调整”的改动

## 当前视觉原则

- 业务 UI 优先使用 Ant Design 组件 API 与 token，而不是用 Tailwind 修补组件本体。
- AI 交互 UI 优先使用 Ant Design X，并与普通业务 UI 保持视觉层级区分。
- Tailwind 只放在 wrapper、布局壳和原生 HTML 上。
- 颜色、圆角、阴影和层级优先消费 `src/index.css` 暴露的语义变量，或 Ant Design token。
- 新增颜色必须遵守 [colors.md](./colors.md)，不得在页面或局部组件里写临时硬色值。
- 页面应保持清楚的信息层级、稳定的间距节奏、可感知的交互反馈，并避免文字或控件重叠。
- 深色模式由 Ant Design theme algorithm 与 `.dark` 语义变量共同承担，不在局部组件里手写暗色魔法值。

## 文件索引

- [ai-rules.md](./ai-rules.md)：AI 生成或调整 UI 时必须优先遵守的视觉约束。
- [colors.md](./colors.md)：颜色 token、AI 强调色、状态色和硬色值边界。
- [../ui-stack-rules.md](../ui-stack-rules.md)：UI 技术栈职责边界。
- [../layout.md](../layout.md)：页面骨架、主内容区和 sidecar 布局规则。
