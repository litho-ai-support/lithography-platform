// src/pages/shared-ui-gallery/shared-ui-gallery.spec.tsx

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SharedUiGalleryPage } from './index';

// S3 验收：共享组件组合场景必须真实渲染三态胶囊、卡片与表格（计划表 4 节）。
describe('SharedUiGalleryPage（dev/test 组件组合场景）', () => {
  it('渲染页头与三态加中性的状态胶囊', () => {
    render(<SharedUiGalleryPage />);

    expect(screen.getByRole('heading', { name: '共享组件组合' })).toBeInTheDocument();

    const pill = document.querySelector('.status-pill--ok');
    expect(pill).not.toBeNull();
    expect(document.querySelector('.status-pill--warn')).not.toBeNull();
    expect(document.querySelector('.status-pill--critical')).not.toBeNull();
    expect(document.querySelector('.status-pill--neutral')).not.toBeNull();
  });

  it('渲染统计卡片与表格容器卡片', () => {
    render(<SharedUiGalleryPage />);

    expect(document.querySelectorAll('.data-card').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('.table-container')).not.toBeNull();
    expect(screen.getByText('组件')).toBeInTheDocument();
  });

  // 逐条复核报告 20260916 修复建议 5：统计卡片、筛选栏、三态与三类按钮必须有
  // 实际渲染的取证场景，不能只引用样式定义。
  it('渲染 metric-tile 语言的统计卡片（非 data-card 容器）', () => {
    render(<SharedUiGalleryPage />);

    const statCard = document.querySelector('.stat-card');
    expect(statCard).not.toBeNull();
    expect(statCard?.classList.contains('data-card')).toBe(false);
  });

  it('渲染筛选栏、空错加载三态与三类按钮', () => {
    render(<SharedUiGalleryPage />);

    expect(document.querySelector('.filter-bar')).not.toBeNull();
    expect(document.querySelector('.empty-state')).not.toBeNull();
    expect(document.querySelector('.error-state')).not.toBeNull();
    expect(document.querySelector('.loading-state')).not.toBeNull();

    expect(screen.getByRole('button', { name: '主按钮' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次按钮' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '危险按钮' })).toBeInTheDocument();
  });

  it('页头渲染 eyebrow 装饰小标（可选 API 取证）', () => {
    render(<SharedUiGalleryPage />);

    expect(screen.getByText('Shared UI Evidence')).toHaveClass('page-eyebrow');
  });
});
