<!-- docs/ui-design/ai-rules.md -->

# AI 生成 UI 的视觉约束

本文件约束 AI 在本项目前端中生成、修改页面和组件时的视觉行为。若与具体需求冲突，先说明冲突点，再由人工确认。

## 先看现状

- 先阅读目标页面、相邻组件、`src/index.css`、`src/app/theme`，再决定视觉实现。
- 优先沿用现有 `page-stack`、`page-header`、`surface-panel`、`card-grid`、`metadata-row` 等模式。
- 不为单个页面临时发明一套新的视觉语言。

## 颜色与 Token

- 颜色边界先读 [colors.md](./colors.md)，不要凭局部页面观感临时发明色值。
- 不在 JSX `className` 中写十六进制、`rgb()`、`hsl()` 等魔法色值。
- 不在局部 CSS、inline style 或组件封装里写十六进制、`rgb()`、`hsl()` 等硬色值。
- wrapper 颜色优先使用 Tailwind 语义类，例如 `bg-bg-container`、`text-text-secondary`、`border-border`、`bg-fill-secondary`。
- Ant Design 组件颜色优先通过组件 API、状态 prop、`ConfigProvider` token 或 CSS 变量解决。
- 原生 wrapper 使用 `--ant-color-*` 前，确认它位于 `app-shell app-theme` 下；样式不可见时先查 cssVar 继承，不要先补硬色值。
- AI 强调色只用于 AI 入口、AI sidecar 和 AI 交互区，不扩散到普通页面标题、导航或非 AI 业务按钮。
- 错误、警告、成功、信息状态优先使用 Ant Design 的 `Alert`、`Result`、`Tag`、`Badge`、`message` 等组件表达。
- 深色模式不在组件局部硬编码另一套颜色；优先让 Ant Design token 和 `.dark` 语义变量接管。

## Ant Design 与 Tailwind

- 不在 Ant Design 或 Ant Design X 组件本体上添加 Tailwind `className`。
- Tailwind class 放在外层 wrapper、布局容器或原生 HTML 元素上。
- 组件本体的尺寸、状态、loading、disabled、danger、type 等优先使用组件 API。
- 如果 Ant Design 组件无法满足布局需求，先加 wrapper，不要直接覆盖组件内部结构。

## 间距、圆角、阴影

- 页面主结构优先复用 `app-main`、`page-stack`、`page-header` 和 `surface-panel`。
- wrapper 圆角优先使用 `rounded-block`、`rounded-card`，或直接消费 Ant Design radius 变量。
- wrapper 阴影优先使用 `shadow-card`、`shadow-surface`，不要写任意阴影值。
- 区块间距保持稳定节奏，避免同屏出现多套相近但不一致的 padding / gap。

## 排版

- 页面标题、区块标题、正文、辅助说明应有清楚层级。
- 不使用 viewport 宽度驱动字号。
- `letter-spacing` 保持 `0`，除非已有局部样式明确要求。
- 文案必须在移动端和桌面端都能放进容器；按钮、标签、卡片内文字不能互相遮挡。

## 交互反馈

- 可点击的自定义 wrapper 必须有可感知 hover 或 focus 反馈。
- 按钮 loading 使用 Ant Design `loading`，不要手工切换成另一段文字模拟加载。
- 加载中优先使用与最终结构接近的 `Skeleton`；阻塞型等待才使用 `Spin`。
- 空状态、错误状态和 404 等页面级反馈优先使用 Ant Design `Empty`、`Alert`、`Result`。
- AI 生成过程应区分等待、流式输出、完成或失败，不与普通 HTTP loading 混成同一种状态。

## 响应式与稳定性

- 页面必须在当前项目的桌面和移动布局下保持可读，不出现横向溢出、控件重叠或文字压住后续内容。
- 固定格式元素需要稳定尺寸约束，例如网格、工具栏、按钮组、计数器、卡片列表。
- 不为了制造视觉效果加入装饰性大渐变、漂浮色块或无法解释的背景图。

## 层级

- 不写裸 `z-index` 数字，不使用 Tailwind 数字或任意值 z-index 类。
- 自定义层级使用语义 CSS 变量；Ant Design popup 层级交给组件和 `ConfigProvider` 管理。

## 完成前检查

- 运行 `npm run lint`，确认 className、魔法色和 z-index 规则没有被破坏。
- 运行 `npm run format:check`。
- 如果改动影响可见页面，启动开发服务并检查桌面与移动宽度下是否有遮挡、溢出和明显错位。
