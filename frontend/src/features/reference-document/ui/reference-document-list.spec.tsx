// src/features/reference-document/ui/reference-document-list.spec.tsx
// @vitest-environment jsdom

/**
 * 参考资料列表面板 UI 单测。
 *
 * 走真实面板 + 真实列表 query 状态机，只 mock 外部 adapter 与路由跳转；
 * 筛选参数形状、空态文案与分页行为均由生产组件决定，测试不复制规则。
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import type {
  ReferenceDocumentListItem,
  ReferenceDocumentListPage,
} from '../infrastructure/reference-document.types';
import * as referenceDocumentAdapter from '../infrastructure/reference-document-adapter';

import { ReferenceDocumentList } from './reference-document-list';

vi.mock('../infrastructure/reference-document-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof referenceDocumentAdapter>();

  return {
    ...actual,
    fetchReferenceDocuments: vi.fn(),
    fetchReferenceEquipmentModels: vi.fn(),
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

const fetchListMock = vi.mocked(referenceDocumentAdapter.fetchReferenceDocuments);
const fetchModelsMock = vi.mocked(referenceDocumentAdapter.fetchReferenceEquipmentModels);

function buildItem(
  id: number,
  overrides: Partial<ReferenceDocumentListItem> = {},
): ReferenceDocumentListItem {
  return {
    id,
    title: `参考资料 ${id}`,
    documentType: 'ERROR_CODE_MANUAL',
    equipmentModelId: 49,
    equipmentModelName: 'ASML TWINSCAN NXT:1980Di',
    description: '说明文本',
    originalFilename: null,
    creatorNickname: '系统管理员',
    createdAt: '2026-08-10T08:00:00.000Z',
    ...overrides,
  };
}

function buildPage(
  items: ReferenceDocumentListItem[],
  total = items.length,
  page = 1,
  pageSize = 10,
): ReferenceDocumentListPage {
  return { items, total, page, pageSize };
}

beforeEach(() => {
  fetchListMock.mockReset();
  fetchModelsMock.mockReset();
  navigateMock.mockReset();
  fetchModelsMock.mockResolvedValue([
    { id: 47, modelCode: 'ASML-TWINSCAN-XT-1900I', modelName: 'ASML TWINSCAN XT:1900i' },
    { id: 49, modelCode: 'ASML-TWINSCAN-NXT-1980DI', modelName: 'ASML TWINSCAN NXT:1980Di' },
  ]);
});

describe('ReferenceDocumentList', () => {
  it('加载中展示骨架屏，就绪后展示列表行与分页', async () => {
    let resolveList: (value: ReferenceDocumentListPage) => void = () => {};
    fetchListMock.mockReturnValueOnce(
      new Promise<ReferenceDocumentListPage>((resolve) => {
        resolveList = resolve;
      }),
    );

    render(<ReferenceDocumentList canManage={false} />);

    expect(document.querySelector('.ant-skeleton')).toBeTruthy();

    await act(async () => {
      resolveList(buildPage([buildItem(970001)], 1));
    });

    await screen.findByText('参考资料 970001');
    expect(document.querySelector('.ant-skeleton')).toBeNull();
    expect(screen.getByText('错误代码手册')).toBeTruthy();
    expect(screen.getByText('ASML TWINSCAN NXT:1980Di')).toBeTruthy();
    // 纯文本资料展示占位而非空白
    expect(screen.getByText('纯文本')).toBeTruthy();
    expect(screen.getByText('共 1 条')).toBeTruthy();
  });

  it('无筛选时以不带 filter 参数请求；点击行进入详情路由', async () => {
    fetchListMock.mockResolvedValue(buildPage([buildItem(970001)]));

    render(<ReferenceDocumentList canManage={false} />);
    await screen.findByText('参考资料 970001');

    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }, undefined);

    fireEvent.click(screen.getByText('参考资料 970001'));

    expect(navigateMock).toHaveBeenCalledWith('/reference-documents/970001');
  });

  it('标题搜索防抖后按关键词请求', async () => {
    vi.useFakeTimers();

    try {
      fetchListMock.mockResolvedValue(buildPage([buildItem(970001)]));

      render(<ReferenceDocumentList canManage={false} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchListMock).toHaveBeenCalledTimes(1);

      fireEvent.change(screen.getByPlaceholderText('按文档标题搜索'), {
        target: { value: '维护指南' },
      });

      // 防抖窗口内不触发请求
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(fetchListMock).toHaveBeenCalledTimes(1);

      // 防抖窗口过后按关键词重载
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(fetchListMock).toHaveBeenCalledTimes(2);
      expect(fetchListMock).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 10 },
        { titleKeyword: '维护指南' },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('选择文档类型与设备型号后请求携带组合 filter（下拉经 AntD 门户渲染）', async () => {
    fetchListMock.mockResolvedValue(buildPage([buildItem(970001)]));

    render(<ReferenceDocumentList canManage={false} />);
    await screen.findByText('参考资料 970001');

    // AntD Select 的 placeholder 不是 input 属性，jsdom 下按 combobox role + 页面顺序定位
    //（与 real e2e 先例一致）；下拉经 portal 渲染，mouseDown 展开
    const [typeSelect, modelSelect] = screen.getAllByRole('combobox');
    await act(async () => {
      fireEvent.mouseDown(typeSelect);
    });
    fireEvent.click(await screen.findByText('维护指南'));

    await waitFor(() => {
      expect(fetchListMock).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 10 },
        { documentType: 'MAINTENANCE_GUIDE' },
      );
    });

    await act(async () => {
      fireEvent.mouseDown(modelSelect);
    });
    // 型号 option label 为「modelName（modelCode）」组合格式，按子串匹配
    fireEvent.click(await screen.findByText(/ASML TWINSCAN XT:1900i/));

    await waitFor(() => {
      expect(fetchListMock).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 10 },
        { documentType: 'MAINTENANCE_GUIDE', equipmentModelId: 47 },
      );
    });
  });

  it('结果为空区分「筛选无结果」与「库为空」', async () => {
    fetchListMock.mockResolvedValue(buildPage([], 0, 1));

    render(<ReferenceDocumentList canManage={false} />);

    await screen.findByText('暂无参考资料。');

    // 打开文档类型下拉（筛选区首个 combobox）并选中 → 空文案切换为筛选语义
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('错误代码手册'));

    await screen.findByText('没有符合筛选条件的参考资料。');
    expect(screen.queryByText('暂无参考资料。')).toBeNull();
  });

  it('加载失败展示共享错误文案与重试入口，重试沿用当前页码', async () => {
    const networkError = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    fetchListMock.mockRejectedValueOnce(networkError);

    render(<ReferenceDocumentList canManage={false} />);

    await screen.findByText(networkError.userMessage);
    expect(screen.queryByText('暂无参考资料。')).toBeNull();

    fetchListMock.mockResolvedValueOnce(buildPage([buildItem(970002)]));
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    await screen.findByText('参考资料 970002');
    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }, undefined);
  });

  it('canManage 控制新增入口可见性；不可见时不渲染按钮', async () => {
    fetchListMock.mockResolvedValue(buildPage([buildItem(970001)]));

    const { rerender } = render(<ReferenceDocumentList canManage={false} />);
    await screen.findByText('参考资料 970001');

    expect(screen.queryByText('新增资料')).toBeNull();

    rerender(<ReferenceDocumentList canManage={true} />);
    await screen.findByText('新增资料');

    fireEvent.click(screen.getByText('新增资料'));
    expect(navigateMock).toHaveBeenCalledWith('/reference-documents/new');
  });
});
