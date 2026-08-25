import { Gender, UserState } from '@app-types/models/user-info.types';
import { ACCOUNT_ERROR } from '@core/common/errors/domain-error';
import {
  normalizeVisibleBirthDateInput,
  normalizeVisibleGenderInput,
  normalizeVisibleGeographicInput,
  normalizeVisibleLimitedNullableTextInput,
  normalizeVisibleNicknameInput,
  normalizeVisibleNonNegativeIntInput,
  normalizeVisibleNullableTextInput,
  normalizeVisibleTagsInput,
  normalizeVisibleUserStateInput,
} from './update-visible-user-info.input.normalize';

describe('update visible user info input normalize', () => {
  it('昵称应 trim，并将空白或非字符串错误映射为账号领域错误', () => {
    expect(normalizeVisibleNicknameInput('  Alice  ')).toBe('Alice');

    expect(() => normalizeVisibleNicknameInput('   ')).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '昵称不可为空',
      }),
    );

    expect(() => normalizeVisibleNicknameInput(123)).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '昵称必须是字符串',
      }),
    );
  });

  it('出生日期应接受 YYYY-MM-DD 或 null，并拒绝其他格式', () => {
    expect(normalizeVisibleBirthDateInput(' 2026-05-22 ')).toBe('2026-05-22');
    expect(normalizeVisibleBirthDateInput(null)).toBeNull();
    expect(() => normalizeVisibleBirthDateInput('2026/05/22')).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '出生日期格式必须为 YYYY-MM-DD',
      }),
    );
  });

  it('nullable text 应 trim，空白转 null，并对长度做限制', () => {
    expect(normalizeVisibleNullableTextInput('  hello  ', { fieldName: '签名' })).toBe('hello');
    expect(normalizeVisibleNullableTextInput('   ', { fieldName: '签名' })).toBeNull();

    expect(
      normalizeVisibleLimitedNullableTextInput(' short ', {
        fieldName: '签名',
        maxLen: 10,
        tooLongMessage: '签名过长',
      }),
    ).toBe('short');

    expect(() =>
      normalizeVisibleLimitedNullableTextInput('too long value', {
        fieldName: '签名',
        maxLen: 5,
        tooLongMessage: '签名过长',
      }),
    ).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '签名过长',
      }),
    );
  });

  it('标签应过滤空白、去重，并在空结果时返回 null', () => {
    expect(normalizeVisibleTagsInput([' ai ', '', 'backend', 'ai'])).toEqual(['ai', 'backend']);
    expect(normalizeVisibleTagsInput([])).toBeNull();
    expect(normalizeVisibleTagsInput(null)).toBeNull();
  });

  it('标签应拒绝非字符串数组元素', () => {
    expect(() => normalizeVisibleTagsInput(['ai', 123])).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '标签必须是字符串数组或为 null',
      }),
    );
  });

  it('地理信息应只接受对象或 null', () => {
    expect(normalizeVisibleGeographicInput({ province: 'Tokyo', city: 'Tokyo' })).toEqual({
      province: 'Tokyo',
      city: 'Tokyo',
    });
    expect(normalizeVisibleGeographicInput(undefined)).toBeNull();
    expect(() => normalizeVisibleGeographicInput([])).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '地理信息必须是对象或为 null',
      }),
    );
  });

  it('枚举与计数字段应提供稳定默认值和边界检查', () => {
    expect(normalizeVisibleGenderInput(undefined)).toBe(Gender.SECRET);
    expect(normalizeVisibleGenderInput(Gender.MALE)).toBe(Gender.MALE);
    expect(normalizeVisibleUserStateInput(undefined)).toBe(UserState.PENDING);
    expect(normalizeVisibleUserStateInput(UserState.ACTIVE)).toBe(UserState.ACTIVE);
    expect(normalizeVisibleNonNegativeIntInput(undefined)).toBe(0);
    expect(normalizeVisibleNonNegativeIntInput(3)).toBe(3);

    expect(() => normalizeVisibleNonNegativeIntInput(-1)).toThrow(
      expect.objectContaining({
        code: ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
        message: '计数必须为不小于 0 的整数',
      }),
    );
  });
});
