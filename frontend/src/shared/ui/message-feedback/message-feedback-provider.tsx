// src/shared/ui/message-feedback/message-feedback-provider.tsx

import { type ReactNode, useMemo } from 'react';
import { message } from 'antd';

import { MessageFeedbackContext } from './message-feedback-context';

/**
 * 在 `ConfigProvider` 内挂一次 AntD `message` 的 context holder，并把 api 下发。
 *
 * 用 `message.useMessage()` 而不是静态 `message.success/error`：静态调用拿不到
 * `ConfigProvider` 的 dynamic theme，运行时会打印
 * 「[antd: message] Static function can not consume context like dynamic theme」。
 * 这里不额外包一层 DOM——`App` 组件的 `component={false}` 在 `cssVar` 开启时自身会告警，
 * 默认 `div` 又会把 `.ant-app` 的全局字号 / 字体 / 颜色套到整个应用上。
 */
export function MessageFeedbackProvider({ children }: { children: ReactNode }) {
  const [api, contextHolder] = message.useMessage();
  const value = useMemo(() => api, [api]);

  return (
    <MessageFeedbackContext.Provider value={value}>
      {contextHolder}
      {children}
    </MessageFeedbackContext.Provider>
  );
}
