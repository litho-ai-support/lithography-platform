import { DomainError, INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';
import {
  normalizeEnumValue,
  normalizeLimit,
  normalizeOptionalText,
  normalizeRequiredText,
  normalizeTextList,
} from './input-normalize.policy';

describe('input normalize policy', () => {
  it('required text 应 trim 并拒绝空白或非字符串', () => {
    expect(normalizeRequiredText('  hello  ', { fieldName: '名称' })).toBe('hello');

    expect(() => normalizeRequiredText('   ', { fieldName: '名称' })).toThrow(
      expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY }),
    );
    expect(() => normalizeRequiredText(123, { fieldName: '名称' })).toThrow(
      expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.INVALID_TEXT }),
    );
  });

  it('optional text 应按空值策略输出稳定结果', () => {
    expect(normalizeOptionalText(undefined, 'to_undefined')).toBeUndefined();
    expect(normalizeOptionalText(null, 'to_undefined')).toBeNull();
    expect(normalizeOptionalText('  hello  ', 'to_undefined')).toBe('hello');
    expect(normalizeOptionalText('   ', 'to_undefined')).toBeUndefined();
    expect(normalizeOptionalText('   ', 'to_null')).toBeNull();
    expect(normalizeOptionalText('   ', 'keep_empty_string')).toBe('');

    expect(() => normalizeOptionalText('   ', 'reject', { fieldName: '名称' })).toThrow(
      expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.OPTIONAL_TEXT_EMPTY_REJECTED }),
    );
  });

  it('text list 应支持过滤空值、去重和保持顺序', () => {
    expect(
      normalizeTextList(
        [' alpha ', '', 'beta', 'alpha', 123, ' beta '],
        {
          filter_empty: true,
          reject_invalid_item: false,
          dedupe: true,
          empty_result: 'to_null',
        },
        { fieldName: '标签' },
      ),
    ).toEqual(['alpha', 'beta']);
  });

  it('text list 应在策略要求时拒绝非法元素', () => {
    expect(() =>
      normalizeTextList(
        ['alpha', 123],
        {
          filter_empty: true,
          reject_invalid_item: true,
          dedupe: true,
          empty_result: 'to_null',
        },
        { fieldName: '标签' },
      ),
    ).toThrow(expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.INVALID_TEXT_LIST_ITEM }));
  });

  it('limit 应截断小数并按范围 clamp', () => {
    expect(normalizeLimit(undefined, { fallback: 20, min: 1, max: 100 })).toBe(20);
    expect(normalizeLimit(0, { fallback: 20, min: 1, max: 100 })).toBe(1);
    expect(normalizeLimit(120, { fallback: 20, min: 1, max: 100 })).toBe(100);
    expect(normalizeLimit(12.9, { fallback: 20, min: 1, max: 100 })).toBe(12);
  });

  it('limit 应拒绝非法范围策略或非法输入值', () => {
    expect(() => normalizeLimit(1, { fallback: 20, min: 100, max: 1 })).toThrow(
      expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.INVALID_LIMIT_RANGE }),
    );
    expect(() => normalizeLimit('10', { fallback: 20, min: 1, max: 100 })).toThrow(
      expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.INVALID_LIMIT_VALUE }),
    );
  });

  it('enum normalize 应支持大小写不敏感匹配并返回规范枚举值', () => {
    expect(
      normalizeEnumValue('staff', ['ADMIN', 'STAFF', 'GUEST'] as const, {
        fieldName: '角色',
        caseInsensitive: true,
      }),
    ).toBe('STAFF');

    expect(() =>
      normalizeEnumValue('owner', ['ADMIN', 'STAFF', 'GUEST'] as const, {
        fieldName: '角色',
        caseInsensitive: true,
      }),
    ).toThrow(DomainError);
  });
});
