// src/modules/common/security/token-fingerprint.helper.ts
import { createHash } from 'crypto';

/**
 * Token 指纹生成工具类
 * 用于生成 token 的 SHA-256 哈希指纹
 *
 * 设计原则：
 * - 指纹生成仅基于 token 本身，不掺入 audience 等其他参数
 * - audience 等上下文信息通过 payload 字段单独存储和匹配
 * - 确保创建、查询、消费全流程的指纹一致性
 */
export class TokenFingerprintHelper {
  /**
   * 生成 token 指纹
   * @param params - 参数对象
   * @param params.token - 需要生成指纹的 token
   * @returns Buffer - SHA-256 哈希结果
   */
  static generateTokenFingerprint(params: { token: string }): Buffer {
    const { token } = params;

    return createHash('sha256').update(token, 'utf8').digest();
  }

  /**
   * 验证 token 指纹
   * @param params - 参数对象
   * @param params.token - 原始 token
   * @param params.expectedFingerprint - 期望的指纹值
   * @returns boolean - 验证结果
   */
  static verifyTokenFingerprint(params: { token: string; expectedFingerprint: Buffer }): boolean {
    const { token, expectedFingerprint } = params;

    const actualFingerprint = this.generateTokenFingerprint({ token });

    return actualFingerprint.equals(expectedFingerprint);
  }
}
