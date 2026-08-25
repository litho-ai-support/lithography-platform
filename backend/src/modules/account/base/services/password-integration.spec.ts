// src/modules/account/base/services/password-integration.spec.ts
import { LegacyPasswordCryptoHelper } from '@modules/common/password/legacy-password-crypto.helper';
import { AccountService } from './account.service';

describe('密码预处理与 PBKDF2 哈希集成测试', () => {
  describe('NFKC 标准化集成', () => {
    it('应该确保全角字符密码的哈希和验证一致性', () => {
      // Arrange
      const fullWidthPassword = 'ｐａｓｓｗｏｒｄ１２３';
      const halfWidthPassword = 'password123';
      const testDate = new Date('2023-03-15T10:18:09Z');

      // Act
      const fullWidthHash = AccountService.hashPasswordWithTimestamp(fullWidthPassword, testDate);
      const halfWidthHash = AccountService.hashPasswordWithTimestamp(halfWidthPassword, testDate);

      // Assert - 全角和半角应该产生相同的哈希
      expect(fullWidthHash).toBe(halfWidthHash);

      // Assert - 交叉验证应该成功
      expect(AccountService.verifyPassword(fullWidthPassword, halfWidthHash, testDate)).toBe(true);
      expect(AccountService.verifyPassword(halfWidthPassword, fullWidthHash, testDate)).toBe(true);
    });

    it('应该与直接使用 PBKDF2 的结果一致', () => {
      // Arrange
      const fullWidthPassword = 'ｐａｓｓｗｏｒｄ１２３';
      const expectedNormalizedPassword = 'password123';
      const testDate = new Date('2023-03-15T10:18:09Z');
      const salt = testDate.toISOString();

      // Act
      const accountServiceHash = AccountService.hashPasswordWithTimestamp(
        fullWidthPassword,
        testDate,
      );
      const directPbkdf2Hash = LegacyPasswordCryptoHelper.hashPasswordWithCrypto(
        expectedNormalizedPassword,
        salt,
      );

      // Assert
      expect(accountServiceHash).toBe(directPbkdf2Hash);
    });
  });

  describe('空格处理验证', () => {
    it('应该拒绝包含前后空格的密码', () => {
      // Arrange
      const testDate = new Date('2023-03-15T10:18:09Z');
      const passwordsWithSpaces = [
        '  password  ',
        ' password',
        'password ',
        '\u3000password\u3000', // 全角空格
        '\u00A0password\u00A0', // 不间断空格
      ];

      // Act & Assert
      passwordsWithSpaces.forEach((password) => {
        expect(() => {
          AccountService.hashPasswordWithTimestamp(password, testDate);
        }).toThrow('密码首尾不能包含空格');
      });
    });
  });

  describe('与原始 PBKDF2 Helper 的兼容性', () => {
    it('应该与直接使用 PasswordPbkdf2Helper 的结果兼容', () => {
      // Arrange
      const cleanPassword = 'password123';
      const testDate = new Date('2023-03-15T10:18:09Z');
      const salt = testDate.toISOString();

      // Act
      const accountServiceHash = AccountService.hashPasswordWithTimestamp(cleanPassword, testDate);
      const directPbkdf2Hash = LegacyPasswordCryptoHelper.hashPasswordWithCrypto(
        cleanPassword,
        salt,
      );

      // Assert
      expect(accountServiceHash).toBe(directPbkdf2Hash);

      // 验证兼容性
      expect(
        LegacyPasswordCryptoHelper.verifyPasswordWithCrypto(
          cleanPassword,
          salt,
          accountServiceHash,
        ),
      ).toBe(true);
      expect(AccountService.verifyPassword(cleanPassword, directPbkdf2Hash, testDate)).toBe(true);
    });

    it('应该确保预处理不会影响已经标准化的密码', () => {
      // Arrange
      const standardPassword = 'StandardPassword123!';
      const testDate = new Date('2023-03-15T10:18:09Z');
      const salt = testDate.toISOString();

      // Act
      const accountServiceHash = AccountService.hashPasswordWithTimestamp(
        standardPassword,
        testDate,
      );
      const directPbkdf2Hash = LegacyPasswordCryptoHelper.hashPasswordWithCrypto(
        standardPassword,
        salt,
      );

      // Assert - 对于已经标准化的密码，结果应该完全一致
      expect(accountServiceHash).toBe(directPbkdf2Hash);
    });
  });
});
