// src/features/reference-document/ui/reference-document-detail-panel.spec.tsx
// @vitest-environment jsdom

/**
 * 参考资料详情面板 UI 单测。
 *
 * 走真实面板 + 真实详情 query 状态机，只 mock 外部 adapter 与路由跳转；
 * 统一 NOT_FOUND 态、编辑/软删入口的角色可见性、软删防重与不乐观口径均由
 * 生产组件决定，测试不复制规则。
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReferenceDocumentDetail } from '../infrastructure/reference-document.types';
import * as referenceDocumentAdapter from '../infrastructure/reference-document-adapter';

import { ReferenceDocumentDetailPanel } from './reference-document-detail-panel';

vi.mock('../infrastructure/reference-document-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof referenceDocumentAdapter>();

  return {
    ...actual,
    fetchReferenceDocument: vi.fn(),
    updateReferenceDocument: vi.fn(),
    deleteReferenceDocument: vi.fn(),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const navigateMock = vi.fn();

const fetchDetailMock = vi.mocked(referenceDocumentAdapter.fetchReferenceDocument);
const updateMock = vi.mocked(referenceDocumentAdapter.updateReferenceDocument);
const deleteMock = vi.mocked(referenceDocumentAdapter.deleteReferenceDocument);

function buildDetail(id: number): ReferenceDocumentDetail {
  return {
    id,
    title: 'NXE:3400C 光源维护指南（Mock）',
    documentType: 'MAINTENANCE_GUIDE',
    equipmentModelId: 51,
    equipmentModelName: 'ASML TWINSCAN NXE:3400C',
    description: '光源模块周期性维护要点。',
    originalFilename: 'nxe-3400c-source-guide-mock.pdf',
    mimeType: 'application/pdf',
    contentText: '# 光源维护指南\n\n每周记录能量衰减。',
    creatorNickname: '陈工',
    createdAt: '2026-08-02T09:30:00.000Z',
    updatedAt: '2026-08-05T14:00:00.000Z',
  };
}

beforeEach(() => {
  fetchDetailMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  navigateMock.mockReset();
});

describe('ReferenceDocumentDetailPanel', () => {
  it('详情展示完整元数据与文本内容；ENGINEER（canManage=false）只见只读态', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: buildDetail(970002) });

    render(<ReferenceDocumentDetailPanel canManage={false} documentId={970002} />);

    await screen.findByText('NXE:3400C 光源维护指南（Mock）');

    expect(screen.getByText('维护指南')).toBeTruthy();
    expect(screen.getByText('ASML TWINSCAN NXE:3400C')).toBeTruthy();
    expect(screen.getByText('陈工')).toBeTruthy();
    expect(screen.getByText(/每周记录能量衰减/)).toBeTruthy();
    // 只读态：无编辑 / 删除入口
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
  });

  it('canManage=true 时可见编辑与删除入口', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: buildDetail(970002) });

    render(<ReferenceDocumentDetailPanel canManage={true} documentId={970002} />);

    await screen.findByText('NXE:3400C 光源维护指南（Mock）');

    expect(screen.getByRole('button', { name: /编\s*辑/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /删\s*除/ })).toBeTruthy();
  });

  it('统一 NOT_FOUND：不存在与已软删呈现 warning 态而非数据', async () => {
    fetchDetailMock.mockResolvedValue({
      ok: false,
      reason: 'not-found',
      message: '参考资料不存在或不可查看。',
    });

    render(<ReferenceDocumentDetailPanel canManage={true} documentId={999999} />);

    await screen.findByText('参考资料不存在或不可查看。');

    expect(screen.queryByText('删除')).toBeNull();
    expect(screen.getByRole('button', { name: /返回列表/ })).toBeTruthy();
  });

  it('加载失败展示共享错误文案与重试入口', async () => {
    fetchDetailMock.mockRejectedValue(
      new (await import('@/shared/graphql')).GraphQLIngressError({
        type: 'network',
        message: 'fetch failed',
      }),
    );

    render(<ReferenceDocumentDetailPanel canManage={false} documentId={970002} />);

    await screen.findByText('网络连接异常，请稍后重试。');
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeTruthy();
  });

  it('编辑：提交成功后刷新详情并退出编辑态；取消丢弃修改', async () => {
    const detail = buildDetail(970002);

    fetchDetailMock.mockResolvedValueOnce({ ok: true, detail }).mockResolvedValueOnce({
      ok: true,
      detail: { ...detail, title: '改名后的维护指南' },
    });
    updateMock.mockResolvedValue({ ok: true, id: 970002 });

    render(<ReferenceDocumentDetailPanel canManage={true} documentId={970002} />);
    await screen.findByText('NXE:3400C 光源维护指南（Mock）');

    // 进入编辑态
    fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }));
    await screen.findByText('编辑参考资料');

    // 取消路径：丢弃修改回详情
    fireEvent.click(screen.getByRole('button', { name: /取消编辑/ }));
    await screen.findByText('NXE:3400C 光源维护指南（Mock）');
    expect(updateMock).not.toHaveBeenCalled();

    // 提交路径：成功后刷新并回到详情展示
    fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }));
    await screen.findByText('编辑参考资料');
    fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
      target: { value: '改名后的维护指南' },
    });
    fireEvent.click(screen.getByRole('button', { name: /保存修改/ }));

    await screen.findByText('改名后的维护指南');
    expect(updateMock).toHaveBeenCalledWith(
      970002,
      expect.objectContaining({
        title: '改名后的维护指南',
      }),
    );
    expect(fetchDetailMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('编辑参考资料')).toBeNull();
  });

  it('软删：二次确认后删除并回列表；失败给原因并刷新数据态，不乐观成功', async () => {
    const detail = buildDetail(970002);

    fetchDetailMock.mockResolvedValue({ ok: true, detail });

    const { rerender } = render(
      <ReferenceDocumentDetailPanel canManage={true} documentId={970002} />,
    );
    await screen.findByText('NXE:3400C 光源维护指南（Mock）');

    deleteMock.mockResolvedValue({ ok: true });

    // 未确认前不调用删除（精确匹配主按钮，避免命中 Popconfirm 的「确认删除」）
    fireEvent.click(screen.getByRole('button', { name: '删 除' }));
    expect(deleteMock).not.toHaveBeenCalled();

    // Popconfirm 确认
    fireEvent.click(await screen.findByText('确认删除'));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/reference-documents'));

    // 失败路径：展示原因并刷新，不跳转（不乐观成功）
    deleteMock.mockResolvedValue({
      ok: false,
      reason: 'not-found',
      message: '参考资料不存在或不可删除。',
    });
    rerender(<ReferenceDocumentDetailPanel canManage={true} documentId={970002} />);
    await screen.findByText('NXE:3400C 光源维护指南（Mock）');
    fireEvent.click(screen.getAllByRole('button', { name: '删 除' })[0]);
    fireEvent.click(await screen.findByText('确认删除'));

    await screen.findByText('参考资料不存在或不可删除。');
    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
