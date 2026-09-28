// src/pages/reference-documents/index.spec.tsx
// @vitest-environment jsdom

/**
 * S0 先失败红测（PR5，2026-09-23 决策校准后）：独立资料列表页**不启用** PR3 的整页知识库变体，
 * 只在列表内部对齐知识库表格的局部视觉。
 *
 * 口径依据（PR5 决策，2026-09-23 校准）：
 * - 任务书原文只要求资料页「外形与 HTML 的知识库表格保持一致」，限定对象是表格本身，不是
 *   `#knowledge-base-page` 整页工作区；早期计划把它扩写成「必须命中 .kb-card/.kb-table-scope」
 *   才与 PR3 已验收基准互斥，该扩张已撤销。
 * - 因此：保持通用渐变工作区、1280px 内容宽度与默认 PageHeader，**不得**出现五类整页 kb modifier
 *   （与 PR3 回归探针 `kbVariantNodes` 同一集合）；列表局部改用 `reference-library-*` 窄职责作用域
 *   消费同一视觉 Token，不复用 `.kb-*` 壳类，也不修改 baseline §6 与 AppLayout 精确路由。
 *
 * 本文件固定两层契约：
 * 1. 结构契约：独立资料页不启用整页知识库变体，只做表格局部对齐（S0-8 / S3-1 / S3-6）；
 * 2. 角色矩阵（S3-2）：新增入口属**页面页头主操作区**，仅 SUPER_ADMIN 渲染；ENGINEER 不渲染，
 *    列表本体（feature 组件）对两个角色渲染完全一致，不自行判定角色。
 *
 * 数据层由共享 GraphQL 入口 `@/shared/graphql` 的 `executeGraphQL` 桩提供（页面层不允许
 * 深层 import feature 内部 adapter）；列表状态机与展示结构仍由生产组件决定，测试不复制规则。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceDocumentsPage } from './index';

const { executeGraphQLMock, navigateMock, sessionMock } = vi.hoisted(() => ({
  executeGraphQLMock: vi.fn(),
  navigateMock: vi.fn(),
  /** 角色矩阵可变量：用例内改写后重新渲染即可切换页面层判定结果 */
  sessionMock: { role: 'ENGINEER' as 'ENGINEER' | 'SUPER_ADMIN' },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return {
    ...actual,
    useAuthSession: () => ({
      session: { accountId: 900102, role: sessionMock.role, userInfo: null },
      status: 'authenticated',
    }),
  };
});

vi.mock('@/shared/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/graphql')>();

  return { ...actual, executeGraphQL: executeGraphQLMock };
});

/** 按 adapter 发出的 query 文本分发最小合法响应（型号下拉 + 资料列表） */
function stubGraphQLResponses(): void {
  executeGraphQLMock.mockImplementation((query: string) => {
    if (query.includes('query EquipmentModels')) {
      return Promise.resolve({
        equipmentModels: [
          {
            id: 49,
            modelCode: 'ASML-TWINSCAN-NXT-1980DI',
            modelName: 'ASML TWINSCAN NXT:1980Di',
          },
        ],
      });
    }

    if (query.includes('query ReferenceDocuments')) {
      return Promise.resolve({
        referenceDocuments: {
          items: [
            {
              id: 970001,
              title: '参考资料 970001',
              documentType: 'ERROR_CODE_MANUAL',
              equipmentModelId: 49,
              equipmentModelName: 'ASML TWINSCAN NXT:1980Di',
              description: '说明文本',
              originalFilename: null,
              creatorNickname: '系统管理员',
              createdAt: '2026-08-10T08:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 10,
          total: 1,
        },
      });
    }

    return Promise.reject(new Error(`未登记的 GraphQL 请求：${query.slice(0, 60)}`));
  });
}

beforeEach(() => {
  executeGraphQLMock.mockReset();
  navigateMock.mockReset();
  sessionMock.role = 'ENGINEER';
  stubGraphQLResponses();
});

/** PR3 回归探针 `kbVariantNodes` 的同一集合：整页知识库 modifier，独立资料页必须为 0。 */
const PAGE_LEVEL_KB_MODIFIERS = [
  '.kb-page',
  '.kb-card',
  '.page-header--kb',
  '.app-workspace--knowledge-base',
  '.app-main--knowledge-base',
] as const;

describe('独立资料列表页的知识库视觉边界（决策：只对齐表格局部，不启用整页变体）', () => {
  it('保持通用工作区与默认页头：五类整页 kb modifier 计数为 0', async () => {
    const { container } = render(<ReferenceDocumentsPage />);

    await screen.findByText('参考资料 970001');

    for (const selector of PAGE_LEVEL_KB_MODIFIERS) {
      expect(container.querySelector(selector), `${selector} 不应出现在独立资料页`).toBeNull();
    }
  });

  it('列表局部改用 reference-library-* 作用域对齐知识库表格，而非复用 .kb-* 壳类', async () => {
    const { container } = render(<ReferenceDocumentsPage />);

    await screen.findByText('参考资料 970001');

    // 局部表格作用域：S3 的落点（先红后绿，S3-1 已转绿）。
    expect(container.querySelector('.reference-library-table-scope')).not.toBeNull();
    // 同一位置上不得沿用知识库壳类，否则即为“变体泄露到独立资料页”。
    expect(container.querySelector('.kb-table-scope')).toBeNull();
    expect(container.querySelector('.kb-card')).toBeNull();
  });
});

describe('S3-2 角色矩阵：新增入口只在页面页头主操作区，且仅 SUPER_ADMIN 渲染', () => {
  it('ENGINEER 不渲染新增入口，页头动作区为空', async () => {
    sessionMock.role = 'ENGINEER';

    const { container } = render(<ReferenceDocumentsPage />);
    await screen.findByText('参考资料 970001');

    // AntD 图标按钮的可访问名为「plus 新增资料」（图标 aria-label 参与命名），故按子串匹配
    expect(screen.queryByRole('button', { name: /新增资料/ })).toBeNull();
    expect(container.querySelector('.page-header-extra')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN 在页头动作区渲染新增入口，点击进入新增路由', async () => {
    sessionMock.role = 'SUPER_ADMIN';

    const { container } = render(<ReferenceDocumentsPage />);
    await screen.findByText('参考资料 970001');

    const entry = screen.getByRole('button', { name: /新增资料/ });
    // 位置契约：入口必须落在页头动作区（页面主操作），不在列表卡内
    expect(container.querySelector('.page-header-extra')?.contains(entry)).toBe(true);
    expect(container.querySelector('.ant-card-extra')).toBeNull();

    fireEvent.click(entry);
    expect(navigateMock).toHaveBeenCalledWith('/reference-documents/new');
  });
});
