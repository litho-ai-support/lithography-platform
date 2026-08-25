// src/features/error-feedback/ui/error-block.tsx

import { Button, Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

type ErrorBlockAction = {
  label: string;
  onClick?: () => void;
  to?: string;
};

type ErrorBlockProps = {
  actions?: ErrorBlockAction[];
  description: ReactNode;
  icon: ReactNode;
  statusCode: number | string;
  title: string;
  tone: 'error' | 'neutral' | 'warning';
};

const TONE_STYLES = {
  error: {
    codeColor: 'var(--ant-color-error)',
  },
  neutral: {
    codeColor: 'var(--ant-color-text-quaternary)',
  },
  warning: {
    codeColor: 'var(--ant-color-warning)',
  },
};

export function ErrorBlock({
  actions,
  description,
  icon,
  statusCode,
  title,
  tone,
}: ErrorBlockProps) {
  const navigate = useNavigate();
  const toneStyle = TONE_STYLES[tone];

  return (
    <div className="error-block-root flex items-center justify-center overflow-hidden">
      <div className="error-block-shell flex w-full flex-col items-center text-center">
        <div className="error-block-visual relative flex w-full items-center justify-center">
          <div
            aria-hidden
            className="error-block-icon pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ color: toneStyle.codeColor }}
          >
            {icon}
          </div>
          <div className="error-block-content relative">
            <Flex align="center" gap={6} vertical>
              <span
                className="error-block-status-code select-none"
                style={{ color: toneStyle.codeColor }}
              >
                {statusCode}
              </span>
              <Typography.Title
                level={4}
                style={{
                  color: toneStyle.codeColor,
                  fontSize: 'var(--error-block-title-font-size)',
                  fontWeight: 'var(--error-block-title-font-weight)',
                  letterSpacing: 'var(--error-block-title-letter-spacing)',
                  marginBottom: 0,
                  textTransform: 'uppercase',
                }}
              >
                {title}
              </Typography.Title>
            </Flex>
          </div>
        </div>

        <Flex align="center" gap={8} vertical>
          <Typography.Paragraph
            type="secondary"
            style={{
              marginBottom: 0,
              maxWidth: 'var(--error-block-description-max-width)',
              whiteSpace: 'pre-line',
            }}
          >
            {description}
          </Typography.Paragraph>
        </Flex>

        {actions && actions.length > 0 ? (
          <Flex gap={12} justify="center" wrap>
            {actions.map((action, index) => (
              <Button
                key={action.to ?? action.label}
                type={index === 0 ? 'primary' : 'default'}
                onClick={() => {
                  if (action.onClick) {
                    action.onClick();
                    return;
                  }

                  if (action.to) {
                    navigate(action.to);
                  }
                }}
              >
                {action.label}
              </Button>
            ))}
          </Flex>
        ) : null}
      </div>
    </div>
  );
}
