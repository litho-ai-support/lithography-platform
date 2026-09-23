// src/features/admin-document-database/ui/admin-effective-filter.spec.ts

import { describe, expect, it } from 'vitest';

import { toEffectiveAdminFilter } from './admin-effective-filter';

/**
 * R4 有效筛选单一真源单测：锁定「空值剔除、falsy 真值不误删」的边界。
 *
 * 修复前三个 Tab 直接 JSON.stringify 原始筛选对象（含空字符串键）与 `{}` 比较，
 * 默认态被误判为「有筛选」导致空态文案错位；本函数是该派生唯一入口，
 * 其输出同时作为请求参数、reloadKey 与 hasActiveFilter 的依据。
 */
describe('toEffectiveAdminFilter', () => {
  it('全空输入（空串/纯空格/null/undefined）：返回空对象，stringify 等于默认态 {}', () => {
    const result = toEffectiveAdminFilter({
      requestNo: '',
      customerKeyword: '   ',
      errorCode: null,
      isAccepted: undefined,
      equipmentModelId: undefined,
    });

    expect(result).toEqual({});
    expect(JSON.stringify(result)).toBe('{}');
  });

  it('文本 trim 后保留有效值（去首尾空格），并保持键序可稳定序列化', () => {
    const result = toEffectiveAdminFilter({
      requestNo: '  RR-20260901-001  ',
      engineerKeyword: '',
      status: 'ACTIVE',
    });

    expect(result).toEqual({ requestNo: 'RR-20260901-001', status: 'ACTIVE' });
    expect(JSON.stringify(result)).toBe('{"requestNo":"RR-20260901-001","status":"ACTIVE"}');
  });

  it('保留 isAccepted=false：布尔 false 是真实筛选，不能按 falsy 误删', () => {
    const result = toEffectiveAdminFilter({ requestNo: '', isAccepted: false });

    expect(result).toEqual({ isAccepted: false });
    expect('isAccepted' in result).toBe(true);
    expect(JSON.stringify(result)).toBe('{"isAccepted":false}');
  });

  it('保留数字 0 与任一单端日期：0 与单端边界都不能被当作空值剔除', () => {
    const result = toEffectiveAdminFilter({
      equipmentModelId: 0,
      createdAtFrom: '2026-09-01T00:00:00.000Z',
      createdAtTo: undefined,
    });

    expect(result).toEqual({
      equipmentModelId: 0,
      createdAtFrom: '2026-09-01T00:00:00.000Z',
    });
    expect(result.createdAtTo).toBeUndefined();
  });

  it('同样输入两次调用产出相等的序列化结果（reloadKey 可复用的前提）', () => {
    const build = () =>
      toEffectiveAdminFilter({
        requestNo: 'RR-1',
        customerKeyword: ' ',
        isAccepted: false,
        equipmentModelId: undefined,
      });

    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    expect(JSON.stringify(build())).toBe('{"requestNo":"RR-1","isAccepted":false}');
  });

  it('不修改传入的原始对象（纯函数）', () => {
    const source = { requestNo: ' RR-1 ', errorCode: '', isAccepted: false };

    toEffectiveAdminFilter(source);

    expect(source).toEqual({ requestNo: ' RR-1 ', errorCode: '', isAccepted: false });
  });
});
