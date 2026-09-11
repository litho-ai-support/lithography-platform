// src/features/reference-document/ui/reference-document-form.spec.tsx
// @vitest-environment jsdom

/**
 * 参考资料创建 / 编辑共用表单 UI 单测。
 *
 * 走真实表单组件，只 mock 外部 adapter；校验规则（必填 / 超长 / 双空与文件预检）
 * 由生产组件决定，测试不复制规则。
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import * as referenceDocumentAdapter from '../infrastructure/reference-document-adapter';

import { ReferenceDocumentForm } from './reference-document-form';

vi.mock('../infrastructure/reference-document-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof referenceDocumentAdapter>();

  return {
    ...actual,
    fetchReferenceEquipmentModels: vi.fn(),
  };
});

const fetchModelsMock = vi.mocked(referenceDocumentAdapter.fetchReferenceEquipmentModels);

const MODEL_OPTIONS = [
  { id: 47, modelCode: 'ASML-TWINSCAN-XT-1900I', modelName: 'ASML TWINSCAN XT:1900i' },
  { id: 49, modelCode: 'ASML-TWINSCAN-NXT-1980DI', modelName: 'ASML TWINSCAN NXT:1980Di' },
];

const CONTENT_TEXT_PLACEHOLDER = /支持 Markdown 格式的资料正文/;

async function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
    target: { value: '测试资料' },
  });
  fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByText('检查表'));
  fireEvent.change(screen.getByPlaceholderText(CONTENT_TEXT_PLACEHOLDER), {
    target: { value: '# 正文' },
  });
}

/** 向 antd Upload 的隐藏 input 注入文件（手动模式仅暂存，不发请求） */
function selectUploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;

  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  fetchModelsMock.mockReset();
  fetchModelsMock.mockResolvedValue(MODEL_OPTIONS);
});

describe('ReferenceDocumentForm', () => {
  it('提交成功回调收到 trim 后的统一输出', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);

    await fillValidForm();
    fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
      target: { value: '  测试资料  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      title: '测试资料',
      documentType: 'CHECKLIST',
      equipmentModelId: null,
      description: null,
      contentText: '# 正文',
      file: null,
    });
  });

  it('必填项缺失时拦截提交并提示', async () => {
    const onSubmit = vi.fn();

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);
    await screen.findAllByRole('combobox');

    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    // 校验提示用 explain-error 容器检查（placeholder 与错误文本可能同文重复）
    const errorTexts = () =>
      Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map(
        (el) => el.textContent,
      );

    await waitFor(() => expect(errorTexts()).toContain('请输入文档标题'));
    expect(errorTexts()).toContain('请选择文档类型');
    // 文本内容已改为可选（与文件双来源），不再有必填提示
    expect(errorTexts()).not.toContain('请输入文本内容（本周仅支持文本来源）');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('双空预检：文本与文件均未提供时拦截提交并提示', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
      target: { value: '测试资料' },
    });
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('检查表'));
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    expect(await screen.findByText('文本内容与文件至少提供一个。')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('文件类型预检：白名单外扩展名拦截提交并提示', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);

    await fillValidForm();
    selectUploadFile(new File(['malicious'], 'payload.exe', { type: 'application/x-msdownload' }));
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    expect(await screen.findByText('不支持上传 .exe 类型的文件。')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('大小上限预检：超过 20MB 拦截提交并提示', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);

    await fillValidForm();
    const oversized = new File(['content'], 'big.pdf', { type: 'application/pdf' });

    Object.defineProperty(oversized, 'size', { value: 21 * 1024 * 1024 });
    selectUploadFile(oversized);
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    expect(await screen.findByText('上传文件不能超过 20MB。')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('带文件提交走上传中文案，输出携带 File；成功后恢复', async () => {
    let resolveSubmit: ((value: { ok: true }) => void) | undefined;
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);

    await fillValidForm();
    const selected = new File(['manual'], 'machine-manual.txt', { type: 'text/plain' });

    selectUploadFile(selected);
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: '测试资料',
      contentText: '# 正文',
      file: selected,
    });
    // 提交中按钮进入「上传中」文案并防连点（loading 图标参与可访问名，用正则匹配）
    expect(screen.getByRole('button', { name: /上传中/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /上传中/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit?.({ ok: true });
    });

    // loading 图标 span 会残留在可访问名中（jsdom 不感知 width:0），用正则匹配
    await waitFor(() => expect(screen.getByRole('button', { name: /提\s*交/ })).toBeTruthy());
  });

  it('编辑模式：不渲染文件选择；已有文件的资料允许清空正文提交', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ReferenceDocumentForm
        hasExistingFile
        initial={{
          title: '已有文件资料',
          documentType: 'CHECKLIST',
          equipmentModelId: null,
          description: null,
          contentText: '',
        }}
        onSubmit={onSubmit}
      />,
    );

    expect(document.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      title: '已有文件资料',
      documentType: 'CHECKLIST',
      equipmentModelId: null,
      description: null,
      contentText: null,
      file: null,
    });
  });

  it('超长输入被前端拦截', async () => {
    const onSubmit = vi.fn();

    render(<ReferenceDocumentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('请输入文档标题'), {
      target: { value: '长'.repeat(300) },
    });
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('检查表'));
    fireEvent.change(screen.getByPlaceholderText(CONTENT_TEXT_PLACEHOLDER), {
      target: { value: '正文' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提 交' }));

    expect(await screen.findByText('文档标题不能超过 255 个字符')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('业务拒绝展示后端消息并保留表单内容；提交中按钮防连点', async () => {
    let resolveSubmit: ((value: { ok: false; message: string }) => void) | undefined;
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: false; message: string }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(<ReferenceDocumentForm onSubmit={onSubmit} submitText="创建资料" />);

    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /创建资料/ }));

    // 表单校验异步完成：等待提交回调命中后再断言防连点
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /创建资料/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit?.({ ok: false, message: '标题为必填项，且不能超过 255 个字符。' });
    });

    await screen.findByText('标题为必填项，且不能超过 255 个字符。');
    // 表单内容保留
    expect((screen.getByPlaceholderText('请输入文档标题') as HTMLInputElement).value).toBe(
      '测试资料',
    );
  });

  it('型号选项加载失败展示重试入口，重试后恢复', async () => {
    fetchModelsMock
      .mockRejectedValueOnce(new GraphQLIngressError({ message: 'down', type: 'network' }))
      .mockResolvedValueOnce(MODEL_OPTIONS);

    render(<ReferenceDocumentForm onSubmit={vi.fn()} />);

    await screen.findByText('网络连接异常，请稍后重试。');
    // antd 会给两字按钮文本插入空格（“重 试”），用正则匹配可访问名
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    // 型号下拉（第二个 combobox）从禁用恢复可用
    await waitFor(() =>
      expect((screen.getAllByRole('combobox')[1] as HTMLInputElement).disabled).toBe(false),
    );
    expect(fetchModelsMock).toHaveBeenCalledTimes(2);
  });
});
