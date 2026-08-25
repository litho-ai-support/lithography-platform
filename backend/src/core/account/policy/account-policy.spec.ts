import { IdentityTypeEnum } from '@app-types/models/account.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import { parseStaffId } from '../identity/parse-staff-id';
import { expandRoles, hasRole } from './role-access.policy';
import { canViewUserInfo } from './user-info-visibility.policy';

describe('account pure policies', () => {
  describe('role access', () => {
    it('展开 ADMIN 时应包含 STAFF 和 GUEST，但不包含 REGISTRANT', () => {
      expect(expandRoles([IdentityTypeEnum.ADMIN])).toEqual([
        IdentityTypeEnum.ADMIN,
        IdentityTypeEnum.STAFF,
        IdentityTypeEnum.GUEST,
      ]);
    });

    it('应忽略非法角色并保持稳定展开顺序', () => {
      expect(expandRoles(['staff', 'unknown', IdentityTypeEnum.REGISTRANT])).toEqual([
        IdentityTypeEnum.STAFF,
        IdentityTypeEnum.GUEST,
        IdentityTypeEnum.REGISTRANT,
      ]);
    });

    it('应按角色继承判断访问能力', () => {
      expect(hasRole([IdentityTypeEnum.STAFF], IdentityTypeEnum.GUEST)).toBe(true);
      expect(hasRole([IdentityTypeEnum.GUEST], IdentityTypeEnum.STAFF)).toBe(false);
      expect(hasRole([IdentityTypeEnum.REGISTRANT], IdentityTypeEnum.GUEST)).toBe(false);
    });
  });

  describe('user info visibility', () => {
    it('ADMIN 和 STAFF 可以查看他人资料', () => {
      expect(canViewUserInfo([IdentityTypeEnum.ADMIN], { isSelf: false })).toBe(true);
      expect(canViewUserInfo([IdentityTypeEnum.STAFF], { isSelf: false })).toBe(true);
    });

    it('普通角色只能查看自己的资料', () => {
      expect(canViewUserInfo([IdentityTypeEnum.GUEST], { isSelf: false })).toBe(false);
      expect(canViewUserInfo([IdentityTypeEnum.REGISTRANT], { isSelf: false })).toBe(false);
      expect(canViewUserInfo([IdentityTypeEnum.REGISTRANT], { isSelf: true })).toBe(true);
    });
  });

  describe('parseStaffId', () => {
    it('应解析数字、字符串和带前导零的 staff id', () => {
      expect(parseStaffId({ id: 42 })).toBe(42);
      expect(parseStaffId({ id: 42.9 })).toBe(42);
      expect(parseStaffId({ id: ' 00042 ' })).toBe(42);
    });

    it.each<string | number>(['', '   ', 'abc', '-1', '12.3', '0', 0, -1, Number.NaN, Infinity])(
      '应拒绝非法 staff id: %p',
      (id) => {
        expect(() => parseStaffId({ id })).toThrow(DomainError);
        try {
          parseStaffId({ id });
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).code).toBe(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED);
        }
      },
    );
  });
});
