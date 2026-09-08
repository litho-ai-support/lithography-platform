// src/features/reference-document/infrastructure/reference-document-mock-adapter.spec.ts

import { beforeEach, describe, expect, it } from 'vitest';

import { resetReferenceDocumentMockState } from './reference-document-mock-adapter';
import {
  createReferenceDocument,
  deleteReferenceDocument,
  fetchReferenceDocument,
  fetchReferenceDocuments,
  updateReferenceDocument,
} from './reference-document-mock-adapter';

/**
 * Mock 数据访问层契约测试：钉住与后端一致的业务口径
 * （排序 / 筛选 / 分页 / 统一 NOT_FOUND 防探测 / PATCH 语义 / 软删不幂等）。
 */

const VALID_INPUT = {
  title: '新资料',
  documentType: 'CHECKLIST',
  equipmentModelId: null,
  description: null,
  contentText: '正文内容',
};

beforeEach(() => {
  resetReferenceDocumentMockState();
});

describe('fetchReferenceDocuments', () => {
  it('仅返回未软删条目，按 createdAt DESC + id DESC 排序并分页', async () => {
    const page1 = await fetchReferenceDocuments({ page: 1, pageSize: 10 });

    // 种子 970004 已软删不可见；可见 = 种子 5 未删 + 24 批量 = 29
    expect(page1.total).toBe(29);
    expect(page1.items).toHaveLength(10);
    // 最新创建时间在前
    expect(page1.items[0].createdAt >= page1.items[1].createdAt).toBe(true);
    expect(page1.items.some((item) => item.id === 970004)).toBe(false);

    const page3 = await fetchReferenceDocuments({ page: 3, pageSize: 10 });

    expect(page3.items).toHaveLength(9);
    // 最早种子 970001 按时间序排在末页末尾
    expect(page3.items[page3.items.length - 1].id).toBe(970001);
  });

  it('标题模糊搜索 / 类型等值 / 型号等值筛选可组合', async () => {
    const byKeyword = await fetchReferenceDocuments(
      { page: 1, pageSize: 20 },
      { titleKeyword: '错误代码手册' },
    );

    expect(byKeyword.items.every((item) => item.title.includes('错误代码手册'))).toBe(true);
    expect(byKeyword.items.some((item) => item.id === 970001)).toBe(true);

    const byType = await fetchReferenceDocuments(
      { page: 1, pageSize: 50 },
      { documentType: 'SAFETY_STANDARD' },
    );

    expect(byType.items.every((item) => item.documentType === 'SAFETY_STANDARD')).toBe(true);

    const byModel = await fetchReferenceDocuments(
      { page: 1, pageSize: 50 },
      { equipmentModelId: 51 },
    );

    expect(byModel.items.every((item) => item.equipmentModelId === 51)).toBe(true);
    expect(byModel.total).toBeGreaterThan(0);

    const combined = await fetchReferenceDocuments(
      { page: 1, pageSize: 50 },
      { titleKeyword: 'Mock', equipmentModelId: 51 },
    );

    expect(
      combined.items.every((item) => item.title.includes('Mock') && item.equipmentModelId === 51),
    ).toBe(true);
  });
});

describe('fetchReferenceDocument', () => {
  it('详情返回完整元数据与文本内容，不含软删标志', async () => {
    const result = await fetchReferenceDocument(970002);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.detail).toMatchObject({
        id: 970002,
        title: 'NXE:3400C 光源维护指南（Mock）',
        equipmentModelId: 51,
        originalFilename: 'nxe-3400c-source-guide-mock.pdf',
        mimeType: 'application/pdf',
      });
      expect(result.detail.contentText).toContain('光源维护指南');
      expect('deprecated' in result.detail).toBe(false);
    }
  });

  it('不存在与已软删统一 not-found（防探测，不区分原因）', async () => {
    const missing = await fetchReferenceDocument(999999);
    const softDeleted = await fetchReferenceDocument(970004);

    expect(missing).toMatchObject({ ok: false, reason: 'not-found' });
    expect(softDeleted).toMatchObject({ ok: false, reason: 'not-found' });
    expect(missing.ok ? '' : missing.message).toBe(softDeleted.ok ? '' : softDeleted.message);
  });
});

describe('createReferenceDocument', () => {
  it('创建成功返回新 ID，列表可见且昵称由「后端」富集', async () => {
    const result = await createReferenceDocument(VALID_INPUT);

    expect(result.ok).toBe(true);

    if (result.ok) {
      const detail = await fetchReferenceDocument(result.id);

      expect(detail.ok).toBe(true);

      const page = await fetchReferenceDocuments({ page: 1, pageSize: 1 });

      // 新创建时间最新，排在第一
      expect(page.items[0].id).toBe(result.id);
      expect(page.items[0].creatorNickname).toBe('系统管理员');
    }
  });

  it.each([
    ['标题空白', { ...VALID_INPUT, title: '   ' }],
    ['标题超长', { ...VALID_INPUT, title: '长'.repeat(256) }],
    ['类型空白', { ...VALID_INPUT, documentType: '' }],
    ['类型超长', { ...VALID_INPUT, documentType: 'A'.repeat(101) }],
    ['文本内容空白', { ...VALID_INPUT, contentText: ' \n ' }],
  ])('%s 拒绝为 invalid-input', async (_name, input) => {
    const result = await createReferenceDocument(input);

    expect(result).toMatchObject({ ok: false, reason: 'invalid-input' });
  });

  it('型号不存在拒绝为 model-not-found', async () => {
    const result = await createReferenceDocument({ ...VALID_INPUT, equipmentModelId: 123456 });

    expect(result).toMatchObject({ ok: false, reason: 'model-not-found' });
  });
});

describe('updateReferenceDocument', () => {
  it('PATCH 语义：undefined 保持原值，null 清空型号与说明', async () => {
    const result = await updateReferenceDocument(970002, {
      title: '改名后的维护指南',
      equipmentModelId: null,
      description: null,
    });

    expect(result).toMatchObject({ ok: true, id: 970002 });

    const detail = await fetchReferenceDocument(970002);

    expect(detail.ok).toBe(true);

    if (detail.ok) {
      // undefined 字段保持原值
      expect(detail.detail.documentType).toBe('MAINTENANCE_GUIDE');
      expect(detail.detail.contentText).toContain('光源维护指南');
      // 显式 null 清空
      expect(detail.detail.equipmentModelId).toBeNull();
      expect(detail.detail.equipmentModelName).toBeNull();
      expect(detail.detail.description).toBeNull();
      expect(detail.detail.title).toBe('改名后的维护指南');
    }
  });

  it('必填字段显式 null / 文本内容空白 / 型号不存在均拒绝', async () => {
    await expect(updateReferenceDocument(970001, { title: null })).resolves.toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    await expect(updateReferenceDocument(970001, { documentType: null })).resolves.toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    await expect(updateReferenceDocument(970001, { contentText: '  ' })).resolves.toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    await expect(
      updateReferenceDocument(970001, { equipmentModelId: 999999 }),
    ).resolves.toMatchObject({ ok: false, reason: 'model-not-found' });
  });

  it('不存在 / 已软删统一 not-found', async () => {
    await expect(updateReferenceDocument(999999, { title: 'x' })).resolves.toMatchObject({
      ok: false,
      reason: 'not-found',
    });
    await expect(updateReferenceDocument(970004, { title: 'x' })).resolves.toMatchObject({
      ok: false,
      reason: 'not-found',
    });
  });
});

describe('deleteReferenceDocument', () => {
  it('软删后列表与详情不可见', async () => {
    const result = await deleteReferenceDocument(970003);

    expect(result).toMatchObject({ ok: true });
    await expect(fetchReferenceDocument(970003)).resolves.toMatchObject({
      ok: false,
      reason: 'not-found',
    });

    const page = await fetchReferenceDocuments({ page: 1, pageSize: 50 });

    expect(page.items.some((item) => item.id === 970003)).toBe(false);
  });

  it('重复软删不幂等：统一 not-found（区别于维修申请的后端口径）', async () => {
    await deleteReferenceDocument(970003);

    await expect(deleteReferenceDocument(970003)).resolves.toMatchObject({
      ok: false,
      reason: 'not-found',
    });
    await expect(deleteReferenceDocument(999999)).resolves.toMatchObject({
      ok: false,
      reason: 'not-found',
    });
  });
});
