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
});
