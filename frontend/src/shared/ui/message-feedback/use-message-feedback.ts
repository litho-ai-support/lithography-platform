// src/shared/ui/message-feedback/use-message-feedback.ts

import { useCallback, useContext } from 'react';

import type { NotifyFeedback } from '@/shared/feedback';

import { MessageFeedbackContext, type MessageInstance } from './message-feedback-context';

/**
 * Provider 是 application feedback port 的必要装配条件
 * （`src/app/providers/theme-provider.tsx` 在 `ConfigProvider` 内挂载）。
 * 缺失时失败关闭并立即暴露装配错误：若退回静默 no-op，
 * 删除成功 / 下载失败等业务反馈会无声消失，装配回归还会在单测里假绿。
 */
function requireMessageApi(api: MessageInstance | null): MessageInstance {
  if (api === null) {
    throw new Error('useMessageFeedback must be used within MessageFeedbackProvider');
  }

  return api;
}

/** 反馈端口在 ui 层的实现（AntD `message.useMessage()` 的 context api）。 */
export function useMessageFeedback(): NotifyFeedback {
  const api = requireMessageApi(useContext(MessageFeedbackContext));

  return useCallback(
    (notice) => {
      if (notice.type === 'success') {
        api.success(notice.text);

        return;
      }

      api.error(notice.text);
    },
    [api],
  );
}
