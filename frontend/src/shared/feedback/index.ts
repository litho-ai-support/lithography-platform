// src/shared/feedback/index.ts

/**
 * 流程反馈端口（技术契约，无业务语义）。
 *
 * 存在理由：`application` 层不得依赖具体 UI 组件实现（`docs/stable-clean/architecture.md`
 * 「最小落地规则」第 6 条），因此 application 不能直接调用 AntD `message`。
 * 由 ui 层把「怎么呈现」作为窄 port 注入，application 只上报结构化流程结果。
 *
 * 归属：本模块只含类型，不含 React / antd / 浏览器细节，属跨 feature 的通用技术契约。
 * 放在 `shared` 的原因：repair-request 与 reference-document 两个 feature 都要用，
 * 而 features 之间不得横向依赖（`docs/dependency-rules.md`）。
 */

/** application 上报的单条流程反馈 */
export type FeedbackNotice = { type: 'success' | 'error'; text: string };

/** ui 层注入的反馈端口 */
export type NotifyFeedback = (notice: FeedbackNotice) => void;
