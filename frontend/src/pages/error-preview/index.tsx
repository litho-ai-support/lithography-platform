// src/pages/error-preview/index.tsx

import { useState } from 'react';
import { Tag } from 'antd';

import { Error403, Error404, Error500, ErrorRouteCrash } from '@/features/error-feedback';

import { PageHeader } from '@/shared/ui/page-header';

const errorPreviewItems = [
  {
    Component: Error404,
    key: 'not-found',
    label: '404',
    path: '/missing-route',
  },
  {
    Component: Error403,
    key: 'forbidden',
    label: '403',
    path: 'loader: forbidden',
  },
  {
    Component: Error500,
    key: 'server-error',
    label: '500',
    path: 'loader: server error',
  },
  {
    Component: ErrorRouteCrash,
    key: 'route-crash',
    label: 'ERR',
    path: 'render: route crash',
  },
] as const;

type ErrorPreviewKey = (typeof errorPreviewItems)[number]['key'];

export function ErrorPreviewPage() {
  const [activeErrorPreviewKey, setActiveErrorPreviewKey] = useState<ErrorPreviewKey>('not-found');
  const activeErrorPreview =
    errorPreviewItems.find((previewItem) => previewItem.key === activeErrorPreviewKey) ??
    errorPreviewItems[0];
  const ActiveErrorPreview = activeErrorPreview.Component;

  return (
    <div className="page-stack">
      <PageHeader
        description="用来快速检查通用错误反馈页面的视觉状态，包括路由不存在、访问受限、服务异常和路由渲染异常。"
        title="错误页预览"
      />

      <section className="error-preview" aria-label="错误页预览">
        <div className="preview-window">
          <div className="preview-window-chrome">
            <div className="preview-window-dots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <div className="preview-window-address">{activeErrorPreview.path}</div>
          </div>

          <div className="preview-window-body">
            <div className="preview-window-sidebar" role="tablist" aria-label="错误页类型">
              {errorPreviewItems.map((previewItem) => (
                <button
                  aria-selected={previewItem.key === activeErrorPreview.key}
                  className={
                    previewItem.key === activeErrorPreview.key
                      ? 'preview-window-tab preview-window-tab-active'
                      : 'preview-window-tab'
                  }
                  key={previewItem.key}
                  onClick={() => setActiveErrorPreviewKey(previewItem.key)}
                  role="tab"
                  type="button"
                >
                  {previewItem.label}
                </button>
              ))}
            </div>

            <div className="preview-window-content">
              <div className="metadata-row">
                <Tag>错误页</Tag>
                <span>当前演示：{activeErrorPreview.label}</span>
              </div>
              <div className="preview-window-stage">
                <ActiveErrorPreview />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
