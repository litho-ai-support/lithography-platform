import { IdentityTypeEnum } from '@app-types/models/account.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import { parseStaffId } from '../identity/parse-staff-id';
import { expandRoles, hasRole } from './role-access.policy';
import { canViewUserInfo } from './user-info-visibility.policy';

describe('account pure policies', () => {
  describe('role access', () => {
    it('展开 SUPER_ADMIN 时应包含 ENGINEER 和 CUSTOMER', () => {
      expect(expandRoles([IdentityTypeEnum.SUPER_ADMIN])).toEqual([
        IdentityTypeEnum.SUPER_ADMIN,
        IdentityTypeEnum.ENGINEER,
        IdentityTypeEnum.CUSTOMER,
      ]);
    });

    it('应忽略非法角色并保持稳定展开顺序', () => {
      expect(expandRoles(['engineer', 'unknown', IdentityTypeEnum.CUSTOMER])).toEqual([
        IdentityTypeEnum.ENGINEER,
        IdentityTypeEnum.CUSTOMER,
      ]);
    });

    it('应按角色继承判断访问能力', () => {
      expect(hasRole([IdentityTypeEnum.SUPER_ADMIN], IdentityTypeEnum.ENGINEER)).toBe(true);
      expect(hasRole([IdentityTypeEnum.SUPER_ADMIN], IdentityTypeEnum.CUSTOMER)).toBe(true);
      expect(hasRole([IdentityTypeEnum.ENGINEER], IdentityTypeEnum.CUSTOMER)).toBe(false);
      expect(hasRole([IdentityTypeEnum.CUSTOMER], IdentityTypeEnum.ENGINEER)).toBe(false);
      expect(hasRole([IdentityTypeEnum.CUSTOMER], IdentityTypeEnum.CUSTOMER)).toBe(true);
    });
  });

  describe('user info visibility', () => {
    it('SUPER_ADMIN 和 ENGINEER 可以查看他人资料', () => {
      expect(canViewUserInfo([IdentityTypeEnum.SUPER_ADMIN], { isSelf: false })).toBe(true);
      expect(canViewUserInfo([IdentityTypeEnum.ENGINEER], { isSelf: false })).toBe(true);
    });

    it('普通角色只能查看自己的资料', () => {
      expect(canViewUserInfo([IdentityTypeEnum.CUSTOMER], { isSelf: false })).toBe(false);
      expect(canViewUserInfo([IdentityTypeEnum.CUSTOMER], { isSelf: true })).toBe(true);
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
