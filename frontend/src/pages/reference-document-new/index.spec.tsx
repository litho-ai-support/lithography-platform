// src/pages/reference-document-new/index.spec.tsx
// @vitest-environment jsdom

/**
 * 新增参考资料页（/reference-documents/new）页面级单测（PR5 S4-1）。
 *
 * 页面职责边界：装配 feature 公开表单 + 消费创建流程 hook（useReferenceDocumentCreate，
 * 由 application 负责通道分流：文件 → REST multipart / 纯文本 → GraphQL）+ 成功态跳转；
 * 校验规则、字段布局与提交中防连点由生产组件决定，测试不复制规则。
 * 两条创建通道在 adapter 模块层替换为模块桩（各自 adapter 的协议细节由其自身 spec 覆盖），
 * 本文件固定「页面装配 + 创建通道分流 + 成功态跳转」这一层端到端契约。
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceDocumentNewPage } from './index';

const { createTextMock, createWithFileMock, executeGraphQLMock, navigateMock } = vi.hoisted(() => ({
  createTextMock: vi.fn(),
  createWithFileMock: vi.fn(),
  executeGraphQLMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 页面经 barrel 消费 application hook（useReferenceDocumentCreate），hook 在 feature 内部
// 以相对路径直连 adapter 模块——mock barrel 拦不到真实数据调用，因此 mock 落在 adapter
// 模块路径上：页面实际调用者即这两个模块桩，断言引用保持一致。
vi.mock(
  '@/features/reference-document/infrastructure/reference-document-adapter',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/reference-document/infrastructure/reference-document-adapter')
      >();

    return { ...actual, createReferenceDocument: createTextMock };
  },
);

vi.mock(
  '@/features/reference-document/infrastructure/reference-document-http-adapter',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/reference-document/infrastructure/reference-document-http-adapter')
      >();

    return { ...actual, createReferenceDocumentWithFile: createWithFileMock };
  },
);

// 型号下拉走共享 GraphQL 入口；页面层不允许深层 import feature adapter
vi.mock('@/shared/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/graphql')>();

  return { ...actual, executeGraphQL: executeGraphQLMock };
});

const MODELS = [
  { id: 49, modelCode: 'ASML-TWINSCAN-NXT-1980DI', modelName: 'ASML TWINSCAN NXT:1980Di' },
];

const FORM_LABELS = ['文档标题', '文档类型', '适用设备型号', '文档说明', '资料文件', '文本内容'];

function stubGraphQLResponses(): void {
  executeGraphQLMock.mockImplementation((query: string) => {
    if (query.includes('query EquipmentModels')) {
      return Promise.resolve({ equipmentModels: MODELS });
    }

    return Promise.reject(new Error(`未登记的 GraphQL 请求：${query.slice(0, 60)}`));
  });
}

/** 选择文档类型（AntD Select：先按下 combobox 再点选项） */
async function selectDocumentType(label: string): Promise<void> {
  fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByText(label));
}

/** 向 antd Upload 的隐藏 input 注入文件（手动模式仅暂存，不发请求） */
function selectUploadFile(file: File): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;

  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input, { target: { files: [file] } });
}

/** 填满「纯文本通道」必需的字段（标题 + 类型 + 正文） */
async function fillTextForm(): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
    target: { value: '  测试资料  ' },
  });
  await selectDocumentType('检查表');
  fireEvent.change(screen.getByPlaceholderText(/支持 Markdown 格式的资料正文/), {
    target: { value: '  # 正文  ' },
  });
}

const submitButton = () => screen.getByRole('button', { name: /创建资料/ });

beforeEach(() => {
  createTextMock.mockReset();
  createWithFileMock.mockReset();
  navigateMock.mockReset();
  executeGraphQLMock.mockReset();
  stubGraphQLResponses();
});

describe('新增参考资料页：装配与字段布局', () => {
  it('页头标题 + 表单落在公共面板内；字段、占位与主按钮齐备', async () => {
    const { container } = render(<ReferenceDocumentNewPage />);

    expect(screen.getByRole('heading', { name: '新增参考资料' })).toBeTruthy();

    const panel = container.querySelector('.surface-panel');

    expect(panel, '表单应包在公共面板 .surface-panel 内（与资料卡片同容器语言）').not.toBeNull();
    expect(panel?.querySelector('form')).not.toBeNull();

    await screen.findAllByRole('combobox');
    for (const label of FORM_LABELS) {
      expect(screen.getByText(label), `缺少字段：${label}`).toBeTruthy();
    }

    // 关键占位与主按钮形态
    expect(screen.getByPlaceholderText('请输入文档标题')).toBeTruthy();
    expect(screen.getByPlaceholderText('选填：资料用途与适用场景说明')).toBeTruthy();
    // AntD v6 的 Select 占位不是 input 的 placeholder 属性，而是渲染为占位节点（tooltip 同文）
    expect(screen.getAllByText('留空表示通用资料').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('请选择文档类型')).toBeTruthy();

    const submit = submitButton();

    expect(submit.getAttribute('type')).toBe('submit');
    expect(submit.classList.contains('ant-btn-primary')).toBe(true);
    expect(submit.textContent).toContain('创建资料');
  });
});

describe('新增参考资料页：创建通道分流与成功态', () => {
  it('纯文本提交：走 GraphQL 通道，成功后进入成功态并可跳详情 / 回列表', async () => {
    createTextMock.mockResolvedValue({ ok: true, id: 990321 });

    render(<ReferenceDocumentNewPage />);

    await fillTextForm();
    fireEvent.click(submitButton());

    await screen.findByText('参考资料创建成功');
    // 输出已 trim，且不携带文件；文件通道未被调用
    expect(createTextMock).toHaveBeenCalledWith({
      title: '测试资料',
      documentType: 'CHECKLIST',
      equipmentModelId: null,
      description: null,
      contentText: '# 正文',
    });
    expect(createWithFileMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /查看详情/ }));
    expect(navigateMock).toHaveBeenCalledWith('/reference-documents/990321');

    fireEvent.click(screen.getByRole('button', { name: /返回列表/ }));
    expect(navigateMock).toHaveBeenCalledWith('/reference-documents');
  });

  it('带文件提交：走 REST multipart 通道，成功后进入成功态', async () => {
    createWithFileMock.mockResolvedValue({ ok: true, id: 990322 });

    render(<ReferenceDocumentNewPage />);

    fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
      target: { value: '测试资料' },
    });
    await selectDocumentType('检查表');
    const selected = new File(['manual'], 'machine-manual.txt', { type: 'text/plain' });

    selectUploadFile(selected);
    fireEvent.click(submitButton());

    await screen.findByText('参考资料创建成功');
    expect(createWithFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'CHECKLIST',
        file: selected,
        title: '测试资料',
      }),
    );
    expect(createTextMock).not.toHaveBeenCalled();
  });

  it('业务拒绝：展示后端消息、保留表单内容且不进入成功态', async () => {
    createTextMock.mockResolvedValue({
      ok: false,
      reason: 'invalid-input',
      message: '输入不符合要求，请检查后重新提交。',
    });

    render(<ReferenceDocumentNewPage />);

    await fillTextForm();
    fireEvent.click(submitButton());

    expect(await screen.findByText('输入不符合要求，请检查后重新提交。')).toBeTruthy();
    expect(screen.queryByText('参考资料创建成功')).toBeNull();
    // 表单内容保留，可原地修改重提
    expect((screen.getByPlaceholderText('请输入文档标题') as HTMLInputElement).value).toBe(
      '  测试资料  ',
    );
  });
});

describe('新增参考资料页：提交中防连点与双空校验', () => {
  it('提交挂起期间重复点击只调用一次创建通道，按钮进入 loading', async () => {
    let resolveSubmit: ((value: { ok: true; id: number }) => void) | undefined;

    createTextMock.mockImplementation(
      () =>
        new Promise<{ ok: true; id: number }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(<ReferenceDocumentNewPage />);

    await fillTextForm();
    fireEvent.click(submitButton());

    await waitFor(() => expect(createTextMock).toHaveBeenCalledTimes(1));
    const loading = submitButton();

    expect(loading.classList.contains('ant-btn-loading')).toBe(true);
    fireEvent.click(loading);
    fireEvent.click(loading);
    expect(createTextMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit?.({ ok: true, id: 990323 });
    });

    await screen.findByText('参考资料创建成功');
    expect(createTextMock).toHaveBeenCalledTimes(1);
  });

  it('「文本 / 文件至少一项」校验在新增页保留：双空拦截且不发创建请求', async () => {
    render(<ReferenceDocumentNewPage />);

    fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
      target: { value: '只有标题' },
    });
    await selectDocumentType('检查表');
    fireEvent.click(submitButton());

    expect(await screen.findByText('文本内容与文件至少提供一个。')).toBeTruthy();
    expect(createTextMock).not.toHaveBeenCalled();
    expect(createWithFileMock).not.toHaveBeenCalled();
  });
});
