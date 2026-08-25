// src/modules/common/password/legacy-password-crypto.helper.spec.ts
import { LegacyPasswordCryptoHelper } from './legacy-password-crypto.helper';

describe('LegacyPasswordCryptoHelper', () => {
  it('应该使用 Node.js crypto 模块生成正确的哈希值', () => {
    // Arrange
    const password = 'guest';
    const salt = '2023-03-15T10:18:09.000Z';
    const expectedHash =
      '36027c3dea6c0068b84f7f8b4f4847f37a7e1e6a88d63620b3d1ca269e6a5f6e64acea140f9b53baf80669b9018e2b0211fe13a7af4477ad91575a67f90bceb3';

    // Act
    const actualHash = LegacyPasswordCryptoHelper.hashPasswordWithCrypto(password, salt);

    // Assert
    expect(actualHash).toBe(expectedHash);
  });

  describe('verifyPasswordWithCrypto', () => {
    it('应该正确验证使用 Node.js crypto 生成的密码', () => {
      // Arrange
      const password = 'guest';
      const salt = '2023-03-15T10:18:09.000Z';
      const hashedPassword =
        '36027c3dea6c0068b84f7f8b4f4847f37a7e1e6a88d63620b3d1ca269e6a5f6e64acea140f9b53baf80669b9018e2b0211fe13a7af4477ad91575a67f90bceb3';

      // Act
      const isValid = LegacyPasswordCryptoHelper.verifyPasswordWithCrypto(
        password,
        salt,
        hashedPassword,
      );

      // Assert
      expect(isValid).toBe(true);
    });

    it('应该拒绝错误的密码', () => {
      // Arrange
      const wrongPassword = 'wrongpassword';
      const salt = '2023-03-15 10:18:09';
      const hashedPassword =
        'c3e10d4a4af293057b42eb10bbf05f436b0a771f8269cb689f8a2b361fbd28d2c5abc547bef1aaf349299be5453a4e62cb6135479d15fa8434841e4528940620';

      // Act
      const isValid = LegacyPasswordCryptoHelper.verifyPasswordWithCrypto(
        wrongPassword,
        salt,
        hashedPassword,
      );

      // Assert
      expect(isValid).toBe(false);
    });

    //   it('应该使 crypto-js 用给定的密码和盐值生成正确的哈希值', () => {
    //     // Arrange
    //     const password = 'guest';
    //     // 模拟从数据库获取的 Date 对象
    //     // const salt = '2023-03-15 10:18:09';
    //     // 转换为与老系统兼容的字符串格式
    //     const salt = new Date('2023-03-15T10:18:09Z').toString();
    //     const expectedHash =
    //       'c3e10d4a4af293057b42eb10bbf05f436b0a771f8269cb689f8a2b361fbd28d2c5abc547bef1aaf349299be5453a4e62cb6135479d15fa8434841e4528940620';
    //
    //     // Act
    //     const actualHash = LegacyPasswordCryptoHelper.hashPassword(password, salt);
    //
    //     // Assert
    //     expect(actualHash).toBe(expectedHash);
    //   });
    // });
  });
});
