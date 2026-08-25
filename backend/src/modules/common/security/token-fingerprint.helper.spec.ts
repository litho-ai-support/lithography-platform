// src/modules/common/security/token-fingerprint.helper.spec.ts
import { createHash } from 'crypto';
import { TokenFingerprintHelper } from './token-fingerprint.helper';

describe('TokenFingerprintHelper', () => {
  describe('generateTokenFingerprint', () => {
    it('应该为相同的 token 生成相同的指纹', () => {
      // Arrange
      const token = 'test-token-123';

      // Act
      const fingerprint1 = TokenFingerprintHelper.generateTokenFingerprint({ token });
      const fingerprint2 = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Assert
      expect(fingerprint1).toEqual(fingerprint2);
      expect(fingerprint1.equals(fingerprint2)).toBe(true);
    });

    it('应该为不同的 token 生成不同的指纹', () => {
      // Arrange
      const token1 = 'test-token-123';
      const token2 = 'test-token-456';

      // Act
      const fingerprint1 = TokenFingerprintHelper.generateTokenFingerprint({ token: token1 });
      const fingerprint2 = TokenFingerprintHelper.generateTokenFingerprint({ token: token2 });

      // Assert
      expect(fingerprint1).not.toEqual(fingerprint2);
      expect(fingerprint1.equals(fingerprint2)).toBe(false);
    });

    it('应该生成 32 字节的 SHA-256 哈希', () => {
      // Arrange
      const token = 'test-token-123';

      // Act
      const fingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Assert
      expect(fingerprint).toBeInstanceOf(Buffer);
      expect(fingerprint.length).toBe(32); // SHA-256 产生 32 字节
    });

    it('应该与直接使用 crypto.createHash 的结果一致', () => {
      // Arrange
      const token = 'test-token-123';
      const expectedFingerprint = createHash('sha256').update(token, 'utf8').digest();

      // Act
      const actualFingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Assert
      expect(actualFingerprint.equals(expectedFingerprint)).toBe(true);
    });

    it('应该处理空字符串 token', () => {
      // Arrange
      const token = '';

      // Act
      const fingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Assert
      expect(fingerprint).toBeInstanceOf(Buffer);
      expect(fingerprint.length).toBe(32);
    });

    it('应该处理包含特殊字符的 token', () => {
      // Arrange
      const token = 'test-token-with-特殊字符-@#$%^&*()';

      // Act
      const fingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Assert
      expect(fingerprint).toBeInstanceOf(Buffer);
      expect(fingerprint.length).toBe(32);
    });

    it('应该处理很长的 token', () => {
      // Arrange
      const token = 'a'.repeat(10000); // 10KB 的 token

      // Act
      const fingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Assert
      expect(fingerprint).toBeInstanceOf(Buffer);
      expect(fingerprint.length).toBe(32);
    });
  });

  describe('verifyTokenFingerprint', () => {
    it('应该验证正确的 token 指纹', () => {
      // Arrange
      const token = 'test-token-123';
      const expectedFingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Act
      const isValid = TokenFingerprintHelper.verifyTokenFingerprint({
        token,
        expectedFingerprint,
      });

      // Assert
      expect(isValid).toBe(true);
    });

    it('应该拒绝错误的 token 指纹', () => {
      // Arrange
      const token = 'test-token-123';
      const wrongToken = 'wrong-token-456';
      const expectedFingerprint = TokenFingerprintHelper.generateTokenFingerprint({
        token: wrongToken,
      });

      // Act
      const isValid = TokenFingerprintHelper.verifyTokenFingerprint({
        token,
        expectedFingerprint,
      });

      // Assert
      expect(isValid).toBe(false);
    });

    it('应该处理空 Buffer 指纹', () => {
      // Arrange
      const token = 'test-token-123';
      const expectedFingerprint = Buffer.alloc(0); // 空 Buffer

      // Act
      const isValid = TokenFingerprintHelper.verifyTokenFingerprint({
        token,
        expectedFingerprint,
      });

      // Assert
      expect(isValid).toBe(false);
    });

    it('应该处理错误长度的指纹', () => {
      // Arrange
      const token = 'test-token-123';
      const expectedFingerprint = Buffer.alloc(16); // 16 字节而不是 32 字节

      // Act
      const isValid = TokenFingerprintHelper.verifyTokenFingerprint({
        token,
        expectedFingerprint,
      });

      // Assert
      expect(isValid).toBe(false);
    });

    it('应该验证包含特殊字符的 token', () => {
      // Arrange
      const token = 'test-token-with-特殊字符-@#$%^&*()';
      const expectedFingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });

      // Act
      const isValid = TokenFingerprintHelper.verifyTokenFingerprint({
        token,
        expectedFingerprint,
      });

      // Assert
      expect(isValid).toBe(true);
    });
  });

  describe('一致性测试', () => {
    it('生成和验证应该保持一致性', () => {
      // Arrange
      const testTokens = [
        'simple-token',
        'token-with-numbers-123',
        'token-with-特殊字符',
        'very-long-token-' + 'x'.repeat(1000),
        '',
        '!@#$%^&*()',
      ];

      testTokens.forEach((token) => {
        // Act
        const fingerprint = TokenFingerprintHelper.generateTokenFingerprint({ token });
        const isValid = TokenFingerprintHelper.verifyTokenFingerprint({
          token,
          expectedFingerprint: fingerprint,
        });

        // Assert
        expect(isValid).toBe(true);
      });
    });

    it('不同 token 的指纹应该都不相同', () => {
      // Arrange
      const tokens = [
        'token1',
        'token2',
        'token3',
        'completely-different-token',
        'another-unique-token',
      ];

      // Act
      const fingerprints = tokens.map((token) =>
        TokenFingerprintHelper.generateTokenFingerprint({ token }),
      );

      // Assert
      for (let i = 0; i < fingerprints.length; i++) {
        for (let j = i + 1; j < fingerprints.length; j++) {
          expect(fingerprints[i].equals(fingerprints[j])).toBe(false);
        }
      }
    });
  });

  describe('性能测试', () => {
    it('应该能够快速处理大量 token', () => {
      // Arrange
      const tokenCount = 1000;
      const tokens = Array.from({ length: tokenCount }, (_, i) => `token-${i}`);

      // Act
      const startTime = Date.now();
      tokens.forEach((token) => {
        TokenFingerprintHelper.generateTokenFingerprint({ token });
      });
      const endTime = Date.now();

      // Assert
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成 1000 次操作
    });
  });
});
