// src/features/repair-request/ui/repair-request-form.spec.tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import {
  createRepairRequest,
  fetchEquipmentModels,
} from '../infrastructure/repair-request-adapter';

import { RepairRequestForm } from './repair-request-form';

vi.mock('../infrastructure/repair-request-adapter', () => ({
  createRepairRequest: vi.fn(),
  fetchEquipmentModels: vi.fn(),
}));

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

const fetchEquipmentModelsMock = vi.mocked(fetchEquipmentModels);
const createRepairRequestMock = vi.mocked(createRepairRequest);

const MODEL_OPTIONS = [
  { id: 11, modelCode: 'LITHO-A', modelName: '型号A' },
  { id: 12, modelCode: 'LITHO-B', modelName: '型号B' },
];

const CREATED_RECORD = {
  id: 1,
  requestNo: 'RR20260826000000ABC123',
  equipmentModelId: 11,
  errorCode: 'E-2001',
  faultDescription: '双工件台干涉仪报错',
  createdAt: '2026-08-26T00:00:00.000Z',
  isAccepted: false,
};

function stubBrowserApis() {
  // matchMedia 桩由全局测试 setup（src/test/setup.ts）提供，此处不重复定义；
  // 只补齐 jsdom 缺失且 antd 依赖的其余浏览器 API。
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  Element.prototype.scrollIntoView = () => {};
}

function isDisabled(element: HTMLElement): boolean {
  return (
    (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true'
  );
}

function renderForm() {
  return render(
    <MemoryRouter>
      <RepairRequestForm />
    </MemoryRouter>,
  );
}

async function selectFirstModel() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByText('型号A（LITHO-A）'));
}

async function fillForm() {
  await selectFirstModel();
  fireEvent.change(screen.getByPlaceholderText('例如：E-2001'), {
    target: { value: 'E-2001' },
  });
  fireEvent.change(screen.getByPlaceholderText('请描述设备故障现象与发生场景'), {
    target: { value: '双工件台干涉仪报错' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

beforeEach(() => {
  stubBrowserApis();
  fetchEquipmentModelsMock.mockReset();
  createRepairRequestMock.mockReset();
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('设备型号加载状态', () => {
  it('加载中时型号选择与提交不可用', () => {
    fetchEquipmentModelsMock.mockReturnValue(new Promise(() => {}));

    renderForm();

    expect(isDisabled(screen.getByRole('combobox'))).toBe(true);
    expect(isDisabled(screen.getByRole('button', { name: '提交申请' }))).toBe(true);
  });

  it('加载失败时展示错误并支持重试', async () => {
    fetchEquipmentModelsMock
      .mockRejectedValueOnce(new GraphQLIngressError({ message: 'down', type: 'network' }))
      .mockResolvedValueOnce(MODEL_OPTIONS);

    renderForm();

    expect(await screen.findByText('网络连接异常，请稍后重试。')).toBeTruthy();
    // antd 会给两字按钮文本插入空格（“重 试”），用正则匹配可访问名
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    const combobox = await screen.findByRole('combobox');
    await expect.poll(() => isDisabled(combobox), { timeout: 3000 }).toBe(false);
    expect(fetchEquipmentModelsMock).toHaveBeenCalledTimes(2);
  });

  it('无可用型号时展示提示且提交不可用', async () => {
    fetchEquipmentModelsMock.mockResolvedValue([]);

    renderForm();

    expect(await screen.findByText('暂无可用的设备型号，请稍后再试。')).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: '提交申请' }))).toBe(true);
  });
});

describe('提交校验与反馈', () => {
  beforeEach(() => {
    fetchEquipmentModelsMock.mockResolvedValue(MODEL_OPTIONS);
  });

  it('必填项缺失时拦截提交并提示', async () => {
    renderForm();
    await screen.findByRole('combobox');

    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('请选择设备型号')).toBeTruthy();
    expect(await screen.findByText('请输入设备错误码')).toBeTruthy();
    expect(await screen.findByText('请输入故障描述')).toBeTruthy();
    expect(createRepairRequestMock).not.toHaveBeenCalled();
  });

  it('创建成功展示后端生成的申请编号', async () => {
    createRepairRequestMock.mockResolvedValue({ ok: true, repairRequest: CREATED_RECORD });

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('维修申请创建成功')).toBeTruthy();
    expect(screen.getByText('申请编号：RR20260826000000ABC123')).toBeTruthy();
    expect(createRepairRequestMock).toHaveBeenCalledWith({
      equipmentModelId: 11,
      errorCode: 'E-2001',
      faultDescription: '双工件台干涉仪报错',
    });
  });

  it('成功后继续创建时表单已重置，不会残留旧值', async () => {
    createRepairRequestMock.mockResolvedValue({ ok: true, repairRequest: CREATED_RECORD });

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('维修申请创建成功')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续创建' }));

    // 型号下拉回到占位文案，文本输入均为空，不会一键重复提交
    expect(await screen.findByText('请选择设备型号')).toBeTruthy();
    expect((screen.getByPlaceholderText('例如：E-2001') as HTMLInputElement).value).toBe('');
    expect(
      (screen.getByPlaceholderText('请描述设备故障现象与发生场景') as HTMLTextAreaElement).value,
    ).toBe('');
  });

  it('成功后返回客户首页（申请列表能力尚不存在，不跳列表）', async () => {
    createRepairRequestMock.mockResolvedValue({ ok: true, repairRequest: CREATED_RECORD });

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('维修申请创建成功')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回客户首页' }));

    expect(navigateMock).toHaveBeenCalledWith('/customer');
  });

  it('提交时对错误码与故障描述去首尾空格', async () => {
    createRepairRequestMock.mockResolvedValue({ ok: true, repairRequest: CREATED_RECORD });

    renderForm();
    await screen.findByRole('combobox');
    await selectFirstModel();
    fireEvent.change(screen.getByPlaceholderText('例如：E-2001'), {
      target: { value: '  E-2001  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('请描述设备故障现象与发生场景'), {
      target: { value: '  双工件台干涉仪报错  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('维修申请创建成功')).toBeTruthy();
    expect(createRepairRequestMock).toHaveBeenCalledWith({
      equipmentModelId: 11,
      errorCode: 'E-2001',
      faultDescription: '双工件台干涉仪报错',
    });
  });

  it('业务拒绝后重新提交成功时清除先前的错误提示', async () => {
    createRepairRequestMock
      .mockResolvedValueOnce({
        ok: false,
        message: '所选设备型号已停用。',
        reason: 'model-disabled',
      })
      .mockResolvedValueOnce({ ok: true, repairRequest: CREATED_RECORD });

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();

    const submitButton = screen.getByRole('button', { name: '提交申请' });
    fireEvent.click(submitButton);
    expect(await screen.findByText('所选设备型号已停用。')).toBeTruthy();

    fireEvent.click(submitButton);
    expect(await screen.findByText('维修申请创建成功')).toBeTruthy();
    expect(screen.queryByText('所选设备型号已停用。')).toBeNull();
    expect(createRepairRequestMock).toHaveBeenCalledTimes(2);
  });

  it('业务拒绝展示后端消息并保留表单内容', async () => {
    createRepairRequestMock.mockResolvedValue({
      ok: false,
      message: '所选设备型号已停用。',
      reason: 'model-disabled',
    });

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('所选设备型号已停用。')).toBeTruthy();
    expect((screen.getByPlaceholderText('例如：E-2001') as HTMLInputElement).value).toBe('E-2001');
  });

  it('transport 失败展示共享错误模型的用户文案', async () => {
    createRepairRequestMock.mockRejectedValue(
      new GraphQLIngressError({ message: 'down', type: 'network' }),
    );

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('网络连接异常，请稍后重试。')).toBeTruthy();
  });

  it('进行中的提交只发送一次 Mutation', async () => {
    const pending = deferred<{ ok: true; repairRequest: typeof CREATED_RECORD }>();
    createRepairRequestMock.mockReturnValue(pending.promise);

    renderForm();
    await screen.findByRole('combobox');
    await fillForm();

    const submitButton = screen.getByRole('button', { name: '提交申请' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    // antd Form 校验是异步的，等提交真正发出后再断言只发了一次
    await waitFor(() => {
      expect(createRepairRequestMock).toHaveBeenCalledTimes(1);
    });

    pending.resolve({ ok: true, repairRequest: CREATED_RECORD });
    expect(await screen.findByText('维修申请创建成功')).toBeTruthy();
  });
});
