// src/sandbox/playground/page.tsx

import { Alert, Card, Tag } from 'antd';

import { PageHeader } from '@/shared/ui/page-header';

import './page.css';

const tokenSwatches = [
  { className: 'sandbox-token-swatch-bg-layout', label: 'Layout', token: '--ant-color-bg-layout' },
  {
    className: 'sandbox-token-swatch-bg-container',
    label: 'Container',
    token: '--ant-color-bg-container',
  },
  { className: 'sandbox-token-swatch-border', label: 'Border', token: '--ant-color-border' },
  { className: 'sandbox-token-swatch-primary', label: 'Primary', token: '--ant-color-primary' },
  { className: 'sandbox-token-swatch-info', label: 'Info', token: '--ant-color-info' },
  { className: 'sandbox-token-swatch-success', label: 'Success', token: '--ant-color-success' },
  { className: 'sandbox-token-swatch-warning', label: 'Warning', token: '--ant-color-warning' },
  { className: 'sandbox-token-swatch-error', label: 'Error', token: '--ant-color-error' },
  { className: 'sandbox-token-swatch-ai', label: 'AI', token: '--color-ai-accent' },
];

const statusSamples = [
  { className: 'sandbox-status-info', label: '信息', text: '用于普通提示和非阻断反馈。' },
  { className: 'sandbox-status-success', label: '成功', text: '用于完成、通过和可继续状态。' },
  { className: 'sandbox-status-warning', label: '警告', text: '用于需要注意但可恢复的状态。' },
  { className: 'sandbox-status-error', label: '错误', text: '用于阻断、失败和风险反馈。' },
];

export function SandboxPlaygroundPage() {
  return (
    <div className="page-stack">
      <PageHeader
        description="用于一次性检查 AntD token、AI 色、边框、卡片和状态色在当前主题下的效果。"
        extra={<Tag>Sandbox</Tag>}
        title="主题 Token 调试台"
      />

      <Alert
        showIcon
        title="这个页面只服务视觉和 token 调试，确认有价值后应重建为 Lab 或整理进正式 owner。"
        type="info"
      />

      <section className="sandbox-token-grid" aria-label="Token 色板">
        {tokenSwatches.map((item) => (
          <div className="sandbox-token-card" key={item.token}>
            <div className={`sandbox-token-swatch ${item.className}`} />
            <div className="sandbox-token-label">{item.label}</div>
            <div className="sandbox-token-name">{item.token}</div>
          </div>
        ))}
      </section>

      <div className="sandbox-token-layout">
        <Card title="卡片与边框">
          <div className="sandbox-surface-stack">
            <div className="sandbox-surface sandbox-surface-container">
              <div className="sandbox-surface-title">Container</div>
              <div className="sandbox-surface-text">使用容器背景、标准边框和卡片阴影。</div>
            </div>
            <div className="sandbox-surface sandbox-surface-muted">
              <div className="sandbox-surface-title">Muted</div>
              <div className="sandbox-surface-text">使用弱填充背景，检查浅色和深色下的分隔感。</div>
            </div>
            <div className="sandbox-surface sandbox-surface-ai">
              <div className="sandbox-surface-title">AI Accent</div>
              <div className="sandbox-surface-text">
                AI 色只作为专用边框和轻背景，不扩散到普通 UI。
              </div>
            </div>
          </div>
        </Card>

        <Card title="状态色">
          <div className="sandbox-status-list">
            {statusSamples.map((item) => (
              <div className={`sandbox-status-item ${item.className}`} key={item.label}>
                <div className="sandbox-status-dot" />
                <div>
                  <div className="sandbox-status-label">{item.label}</div>
                  <div className="sandbox-status-text">{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="深浅色继承检查">
          <div className="sandbox-token-check">
            <div className="sandbox-token-check-row">
              <span>原生 wrapper token</span>
              <Tag color="processing">app-theme</Tag>
            </div>
            <div className="sandbox-token-check-line" />
            <div className="sandbox-surface-text">
              这里依赖 `app-shell app-theme` 继承 `--ant-color-*`。如果边框或背景消失，先检查 cssVar
              class，而不是补硬色值。
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
