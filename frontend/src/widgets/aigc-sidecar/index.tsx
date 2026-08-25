// src/widgets/aigc-sidecar/index.tsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { StarFilled } from '@ant-design/icons';
import { Bubble, Sender } from '@ant-design/x';
import { Button, Card, Divider, Drawer, Typography } from 'antd';

import { resolveLocalAssistantQuery } from '@/features/local-assistant';

import type { AssistantMessage, AssistantRouteCandidate } from '@/entities/assistant-session';

type AigcSidecarProps = {
  onClose: () => void;
  onNavigate: (path: string) => void;
  open: boolean;
  routeCandidates: readonly AssistantRouteCandidate[];
};

type RenderedMessage = AssistantMessage & {
  suggestions?: ReturnType<typeof resolveLocalAssistantQuery>['suggestions'];
};

function createMessageId() {
  return `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function EntryAccentGlyph() {
  return (
    <span aria-hidden="true" className="entry-accent-glyph">
      <StarFilled />
    </span>
  );
}

export function AigcSidecar({ onClose, onNavigate, open, routeCandidates }: AigcSidecarProps) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<RenderedMessage[]>([
    {
      content: '告诉我你想构建什么，或想打开哪个页面。',
      id: 'assistant-welcome',
      role: 'assistant',
    },
  ]);
  const senderHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  const submitPrompt = useCallback(
    (nextPrompt: string) => {
      const normalizedPrompt = nextPrompt.trim();

      if (!normalizedPrompt) {
        return;
      }

      const reply = resolveLocalAssistantQuery(normalizedPrompt, routeCandidates);

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          content: normalizedPrompt,
          id: createMessageId(),
          role: 'user',
        },
        {
          content: reply.content,
          id: createMessageId(),
          role: 'assistant',
          suggestions: reply.suggestions,
        },
      ]);
      setDraft('');
    },
    [routeCandidates],
  );

  if (!open) {
    return null;
  }

  return (
    <Drawer
      destroyOnHidden={false}
      keyboard={false}
      mask={false}
      open={open}
      placement="right"
      rootClassName="entry-sidecar-drawer"
      title={
        <div className="flex items-center gap-2">
          <EntryAccentGlyph />
          <span>从这里开始</span>
        </div>
      }
      styles={{
        body: { display: 'flex', flexDirection: 'column', paddingTop: 16 },
        header: { borderBottom: '1px solid var(--color-ai-accent-border)' },
        section: {
          borderInlineStart: '1px solid var(--color-ai-accent-border)',
          pointerEvents: 'auto',
        },
        wrapper: {
          maxWidth: '100vw',
          pointerEvents: 'none',
          width: 'clamp(360px, 36vw, 560px)',
        },
      }}
      zIndex={1100}
      onClose={onClose}
    >
      <div className="sidecar-root-stack flex h-full w-full flex-col" data-layout-surface="sidecar">
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          这里是本地路由与提示协作入口。关闭后，不影响主页面操作。
        </Typography.Paragraph>

        <Divider style={{ marginBlock: 0 }} />

        <div className="flex-1 overflow-y-auto">
          <div className="sidecar-scroll-stack flex h-full flex-col justify-center">
            {messages.map((message) => (
              <div
                className={`sidecar-message-shell${message.role === 'user' ? ' ml-auto' : ''}`}
                key={message.id}
              >
                <Bubble
                  content={message.content}
                  classNames={{
                    content:
                      message.role === 'user'
                        ? 'entry-sidecar-bubble-content-user'
                        : 'entry-sidecar-bubble-content-system',
                  }}
                  placement={message.role === 'user' ? 'end' : 'start'}
                />
                {message.suggestions && message.suggestions.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {message.suggestions.map((suggestion) => (
                      <div className="sidecar-entry-card" key={suggestion.id}>
                        <Card
                          hoverable
                          size="small"
                          onClick={() => {
                            onNavigate(suggestion.path);
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <Typography.Text strong style={{ fontSize: 'var(--ant-font-size)' }}>
                                {suggestion.label}
                              </Typography.Text>
                              <Typography.Paragraph
                                ellipsis={{ rows: 1 }}
                                style={{ fontSize: 'var(--ant-font-size-sm)', margin: 0 }}
                                type="secondary"
                              >
                                {suggestion.description}
                              </Typography.Paragraph>
                            </div>
                            <Button
                              size="small"
                              type="text"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNavigate(suggestion.path);
                              }}
                            >
                              进入
                            </Button>
                          </div>
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <Typography.Text type="secondary">
              你可以直接描述目标页面或前端任务，我会优先给出本地入口。
            </Typography.Text>
          </div>
        </div>

        <div className="sidecar-input-shell" ref={senderHostRef}>
          <Sender
            onChange={(value) => setDraft(value)}
            onSubmit={submitPrompt}
            placeholder="描述一个页面、路由或前端任务"
            value={draft}
          />
        </div>
      </div>
    </Drawer>
  );
}
