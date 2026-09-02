// src/features/repair-request/repair-request-read-mock-adapter.spec.ts

import { beforeEach, describe, expect, it } from 'vitest';

import {
  deleteMyRepairRequest,
  fetchMyRepairRequest,
  fetchMyRepairRequests,
  resetMyRepairRequestMockState,
} from './infrastructure/repair-request-read-mock-adapter';

describe('维修申请读模型 Mock adapter（契约行为钉住）', () => {
  beforeEach(() => {
    resetMyRepairRequestMockState();
  });

  describe('列表', () => {
    it('按 createdAt DESC + id DESC 排序，且不含已软删除条目', async () => {
      const page = await fetchMyRepairRequests({ page: 1, pageSize: 10 });

      expect(page.total).toBe(4);
      expect(page.items.map((item) => item.id)).toEqual([920005, 920003, 920002, 920001]);
      expect(page.items.some((item) => item.requestNo === 'MOCK-RR-2026-0004')).toBe(false);
    });

    it('OFFSET 分页：第二页取剩余条目并回显分页参数', async () => {
      const page = await fetchMyRepairRequests({ page: 2, pageSize: 3 });

      expect(page.page).toBe(2);
      expect(page.pageSize).toBe(3);
      expect(page.items.map((item) => item.id)).toEqual([920001]);
    });

    it('分页越界返回空页但保留 total（OFFSET 语义）', async () => {
      const page = await fetchMyRepairRequests({ page: 99, pageSize: 10 });

      expect(page.items).toEqual([]);
      expect(page.total).toBe(4);
    });
  });

  describe('详情', () => {
    it('返回详情与回复时间线（实时昵称、无账号 ID 字段）', async () => {
      const result = await fetchMyRepairRequest(920002);

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.detail.requestNo).toBe('MOCK-RR-2026-0002');
        expect(result.detail).not.toHaveProperty('deprecated');
        expect(result.detail.responses.map((response) => response.id)).toEqual([960001, 960002]);
        for (const response of result.detail.responses) {
          expect(typeof response.engineerNickname).toBe('string');
          expect(response).not.toHaveProperty('engineerAccountId');
        }
      }
    });

    it('不存在 / 已软删除统一 not-found（防探测，不区分原因）', async () => {
      const missing = await fetchMyRepairRequest(999999);
      const deleted = await fetchMyRepairRequest(920004);

      expect(missing).toEqual({
        ok: false,
        reason: 'not-found',
        message: '维修申请不存在或不可查看。',
      });
      expect(deleted.ok).toBe(false);
    });
  });

  describe('删除（裁定 5）', () => {
    it('未接单申请软删除成功，删除后列表与详情均不可见', async () => {
      await expect(deleteMyRepairRequest(920001)).resolves.toEqual({ ok: true });

      const list = await fetchMyRepairRequests({ page: 1, pageSize: 10 });
      expect(list.items.some((item) => item.id === 920001)).toBe(false);
      await expect(fetchMyRepairRequest(920001).then((r) => r.ok)).resolves.toBe(false);
    });

    it('已接单申请返回 already-accepted，且不产生删除效果', async () => {
      const result = await deleteMyRepairRequest(920002);

      expect(result).toMatchObject({ ok: false, reason: 'already-accepted' });

      const list = await fetchMyRepairRequests({ page: 1, pageSize: 10 });
      expect(list.items.some((item) => item.id === 920002)).toBe(true);
    });

    it('不存在返回 not-found（不泄露存在性）', async () => {
      await expect(deleteMyRepairRequest(999999)).resolves.toMatchObject({
        ok: false,
        reason: 'not-found',
      });
    });

    it('同一申请重复删除幂等成功', async () => {
      await expect(deleteMyRepairRequest(920005)).resolves.toEqual({ ok: true });
      await expect(deleteMyRepairRequest(920005)).resolves.toEqual({ ok: true });
    });
  });
});
