// src/usecases/admin-document-database/admin-document-database-filter.normalize.spec.ts

import { ADMIN_DOCUMENT_DATABASE_ERROR, DomainError } from '@core/common/errors/domain-error';
import { captureThrownError } from '../../../test/support/account/admin-user.fixture';
import {
  ADMIN_KEYWORD_ACCOUNT_LIMIT,
  ADMIN_KEYWORD_MAX_LENGTH,
  assertKeywordAccountLimit,
  assertPositiveId,
  assertTimeRangeOrder,
  normalizeOptionalFilterText,
  normalizeOptionalKeyword,
} from './admin-document-database-filter.normalize';

/**
 * PR3 S4：管理员文档数据库筛选规范化单测。
 *
 * 覆盖计划表 S4.1「非法排序/筛选、时间范围边界」的输入防御：
 * 空白视为未提供、超长显式拒绝（不静默截断）、Invalid Date 拒绝、
 * from 晚于 to 拒绝（防恒空查询静默返回空页）、动态 ID 安全正整数。
 */
describe('admin-document-database-filter.normalize', () => {
  describe('normalizeOptionalFilterText', () => {
    it.each([
      [null, undefined],
      [undefined, undefined],
      ['', undefined],
      ['   ', undefined],
      [' RR-001 ', 'RR-001'],
    ])('%j → %j（空白视为未提供，其余去首尾空白）', (input, expected) => {
      expect(normalizeOptionalFilterText(input)).toBe(expected);
    });
  });

  describe('normalizeOptionalKeyword', () => {
    it('边界长度 100 字通过，101 字显式拒绝（不静默截断）', () => {
      const keyword100 = '客'.repeat(ADMIN_KEYWORD_MAX_LENGTH);

      expect(normalizeOptionalKeyword(keyword100)).toBe(keyword100);

      const thrown = captureThrownError(
        Promise.resolve().then(() => normalizeOptionalKeyword(`${keyword100}超`)),
      ) as unknown as Promise<DomainError>;

      return thrown.then((error) => {
        expect(error.code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS);
      });
    });

    it('非字符串输入视为未提供', () => {
      expect(normalizeOptionalKeyword(undefined)).toBeUndefined();
    });
  });

  describe('assertTimeRangeOrder', () => {
    it('有效区间（含单端）通过', () => {
      expect(() =>
        assertTimeRangeOrder(new Date('2026-09-01'), new Date('2026-09-30')),
      ).not.toThrow();
      expect(() => assertTimeRangeOrder(new Date('2026-09-01'))).not.toThrow();
      expect(() => assertTimeRangeOrder(undefined, new Date('2026-09-30'))).not.toThrow();
    });

    it.each([
      ['from 为 Invalid Date', new Date('not-a-date'), new Date('2026-09-30')],
      ['to 为 Invalid Date', new Date('2026-09-01'), new Date('invalid')],
    ])('%s 时拒绝（防绕过比较直达 ORM）', (_label, from, to) => {
      const thrown = captureThrownError(
        Promise.resolve().then(() => assertTimeRangeOrder(from, to)),
      ) as unknown as Promise<DomainError>;

      return thrown.then((error) => {
        expect(error.code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS);
      });
    });

    it('from 晚于 to 时拒绝（防恒空查询静默返回空页）', async () => {
      const error = (await captureThrownError(
        Promise.resolve().then(() =>
          assertTimeRangeOrder(new Date('2026-09-30'), new Date('2026-09-01')),
        ),
      )) as DomainError;

      expect(error.code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS);
      expect(error.message).toContain('起始时间不能晚于结束时间');
    });
  });

  describe('assertPositiveId', () => {
    it.each([0, -1, 1.5, Number.NaN])('%j 不是安全正整数，拒绝', (value) => {
      const thrown = captureThrownError(
        Promise.resolve().then(() => assertPositiveId(value, '维修申请 ID', 'requestId')),
      ) as unknown as Promise<DomainError>;

      return thrown.then((error) => {
        expect(error.code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS);
      });
    });

    it('正整数通过', () => {
      expect(() => assertPositiveId(1, '维修申请 ID', 'requestId')).not.toThrow();
    });
  });

  describe('assertKeywordAccountLimit', () => {
    it('命中数恰为上限时通过，超限时显式拒绝', () => {
      expect(() => assertKeywordAccountLimit(ADMIN_KEYWORD_ACCOUNT_LIMIT, '关键字')).not.toThrow();
    });

    it('超限拒绝且 details 携带诊断事实', async () => {
      const error = (await captureThrownError(
        Promise.resolve().then(() =>
          assertKeywordAccountLimit(ADMIN_KEYWORD_ACCOUNT_LIMIT + 1, '关键字'),
        ),
      )) as DomainError;

      expect(error.code).toBe(ADMIN_DOCUMENT_DATABASE_ERROR.INVALID_PARAMS);
      expect(error.details).toMatchObject({
        keyword: '关键字',
        totalMatched: ADMIN_KEYWORD_ACCOUNT_LIMIT + 1,
        limit: ADMIN_KEYWORD_ACCOUNT_LIMIT,
      });
    });
  });
});
