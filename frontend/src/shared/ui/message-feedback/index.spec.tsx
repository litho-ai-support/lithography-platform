// src/shared/ui/message-feedback/index.spec.tsx
// @vitest-environment jsdom

/**
 * 反馈端口 ui 适配单测。
 *
 * 守住 review P2-2：呈现必须走 `message.useMessage()` 的 context api
 * （能消费 ConfigProvider 的 dynamic theme），不得回退到静态 `message.success/error`
 * —— 静态调用会在真实浏览器打印
 * 「[antd: message] Static function can not consume context like dynamic theme」。
 *
 * 守住 review 三次复查 P2-1：Provider 是必要装配条件，缺失时必须失败关闭
 * （渲染期抛 invariant error），不得静默 no-op 吞掉业务反馈。
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider, message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedbackNotice } from '@/shared/feedback';

import { MessageFeedbackProvider, useMessageFeedback } from './index';

function NotifyButton({ notice }: { notice: FeedbackNotice }) {
  const notify = useMessageFeedback();

  return (
    <button onClick={() => notify(notice)} type="button">
      触发反馈
    </button>
  );
}

function renderWithProvider(notice: FeedbackNotice) {
  return render(
    <ConfigProvider>
      <MessageFeedbackProvider>
        <NotifyButton notice={notice} />
      </MessageFeedbackProvider>
    </ConfigProvider>,
  );
}

describe('useMessageFeedback', () => {
  beforeEach(() => {
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('成功通知经 context api 呈现到页面', async () => {
    renderWithProvider({ text: '参考资料已删除。', type: 'success' });

    fireEvent.click(screen.getByRole('button', { name: '触发反馈' }));

    expect(await screen.findByText('参考资料已删除。')).toBeInTheDocument();
    expect(message.success).not.toHaveBeenCalled();
  });

  it('失败通知经 context api 呈现到页面', async () => {
    renderWithProvider({ text: '下载失败，请稍后重试。', type: 'error' });

    fireEvent.click(screen.getByRole('button', { name: '触发反馈' }));

    expect(await screen.findByText('下载失败，请稍后重试。')).toBeInTheDocument();
    expect(message.error).not.toHaveBeenCalled();
  });

  it('无 provider 时失败关闭：渲染期抛 invariant error，不静默吞掉反馈', () => {
    // React 会把渲染期抛错再打印一遍，静音以免污染测试输出
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      render(<NotifyButton notice={{ text: '无 provider', type: 'success' }} />),
    ).toThrow('useMessageFeedback must be used within MessageFeedbackProvider');

    consoleError.mockRestore();
    expect(message.success).not.toHaveBeenCalled();
  });

  it('无 provider 时不得回退到静态 message（抛错路径亦不泄出）', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      render(<NotifyButton notice={{ text: '无 provider', type: 'error' }} />),
    ).toThrow();

    consoleError.mockRestore();
    expect(message.error).not.toHaveBeenCalled();
  });
});
