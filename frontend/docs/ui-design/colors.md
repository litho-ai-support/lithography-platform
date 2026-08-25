<!-- docs/ui-design/colors.md -->

# 颜色规则

本项目的颜色规则用于防止页面、组件和 AI 生成代码把局部色值散落到代码里。

## 决定权

颜色语义只来自以下位置：

- Ant Design `ConfigProvider` token：正式业务 UI、状态色、链接、焦点、背景、边框。
- `src/index.css` 的全局语义 CSS 变量：Tailwind v4 `@theme inline` 别名、AI 区域少量专用变量、层级和布局变量。
- Ant Design 组件 API：`type`、`danger`、`color`、`status` 等明确语义状态。

页面、feature、lab、sandbox 和普通 shared 组件不直接发明颜色。

## Ant Design CSS 变量继承

Ant Design 的 CSS 变量不是天然全局变量。开启 `theme.cssVar` 后，变量会绑定到对应的
cssVar class 选择器上；如果原生 DOM wrapper 不在这个 class 覆盖范围内，`var(--ant-color-*)`
可能解析失败，相关 `border`、`background`、`color` 声明会整条失效。

当前项目的固定约定：

- `src/app/theme/index.ts` 设置 `cssVar.key = 'app-theme'`
- `src/app/layout/app-layout.tsx` 在 `app-shell` 上挂载同名 `app-theme` class
- 页面级原生 wrapper 只有位于 `app-shell app-theme` 下，才可以直接消费 `--ant-color-*`

不要在局部组件里手动复制 `app-theme` class。若发现原生 wrapper 上的 token 样式不可见，先检查
cssVar class 是否挂在上层壳层和实际运行页面中，而不是先加硬色值、fallback 色值或临时装饰色。

## 硬色值边界

十六进制、`rgb()`、`rgba()`、`hsl()`、`hsla()` 只允许出现在受控位置：

- `src/app/theme/index.ts` 中的 Ant Design token 声明。
- `src/index.css` 中少数已文档化的全局颜色 token。
- `public/` 下的品牌图片和图标资源。

除此之外，新增代码应使用：

- `var(--ant-color-*)`
- `var(--color-*)`
- Tailwind 语义类，如 `text-text-secondary`、`border-border`、`bg-bg-container`
- 基于既有 token 的 `color-mix()`

不要在局部 CSS、JSX `className`、inline style 或组件封装里写临时色值。

## AI 强调色

AI 强调色由 `--color-ai-accent` 及其派生变量承载，当前只服务于 AI 入口、AI sidecar 和 AI 交互区。

它不进入 Ant Design `colorPrimary`，也不用于普通页面标题、普通正文、普通导航或非 AI 业务按钮。允许用途：

- AI 图标、入口按钮和专用提示符号
- AI 区域边框、浅背景、focus outline
- 大号标签或标题级强调，且不是唯一信息载体

AI 区域的小号说明文字仍使用 `--ant-color-text`、`--ant-color-text-secondary` 或对应语义变量。

## 状态色

错误、警告、成功、信息状态优先使用 Ant Design 的 `Alert`、`Result`、`Tag`、`Badge`、`message`、`Form.Item status` 等组件语义。

需要自定义状态视觉时，优先使用 Ant Design token，例如：

- `--ant-color-error`
- `--ant-color-warning`
- `--ant-color-success`
- `--ant-color-info`
- `--ant-color-border-secondary`
- `--ant-color-fill-secondary`

状态色进入容器时应降低声量，优先用小标签、状态点、细边框或低占比 `color-mix()`，不要整块铺色。

## 深色模式

深色模式由 Ant Design `darkAlgorithm` 与根节点 `.dark` 共同承担。

局部组件不写另一套硬编码暗色值；需要深色适配时，优先消费会随主题变化的 token 或在 `src/index.css` 中补全语义变量。

## 检查

`npm run lint` 会运行：

- ESLint 中的 JSX `className` 魔法色检查
- `scripts/lint-colors.mjs` 中的 CSS / TS / TSX 硬色值检查
- `scripts/lint-z-index.mjs` 中的层级检查

如果确实需要新增全局颜色 token，先更新本文件，再把色值放到 `src/app/theme/index.ts` 或 `src/index.css` 的受控 token 区域。
