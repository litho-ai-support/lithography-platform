// src/features/repair-request/application/engineer-response-text-capacity.spec.ts

/**
 * 回复正文容量策略单测（UTF-8 字节计量）。
 *
 * 只验证策略自身的字节计量与超限判定，边界与后端 usecase 契约一致：
 * MySQL TEXT 上限 65,535 UTF-8 字节，且计量发生在 trim 之后。
 */

import { describe, expect, it } from 'vitest';

import {
  countEngineerResponseTextBytes,
  ENGINEER_RESPONSE_TEXT_MAX_BYTES,
  isEngineerResponseTextOverCapacity,
} from './engineer-response-text-capacity';

describe('回复正文 UTF-8 字节容量策略', () => {
  it('上限常量为 65,535 bytes（与后端 MySQL TEXT 契约一致）', () => {
    expect(ENGINEER_RESPONSE_TEXT_MAX_BYTES).toBe(65535);
  });

  it('按 UTF-8 字节计量而非字符数：ASCII/中文/emoji 单位字节数正确', () => {
    // ASCII 每字符 1 byte
    expect(countEngineerResponseTextBytes('abc')).toBe(3);
    // 中文每字符 3 bytes（string.length 也是 1，字符数会低估容量）
    expect(countEngineerResponseTextBytes('中')).toBe(3);
    expect('中'.length).toBe(1);
    // emoji 每个 4 bytes（string.length 为 2 个 UTF-16 码元）
    expect(countEngineerResponseTextBytes('😀')).toBe(4);
    expect('😀'.length).toBe(2);
  });

  it('计量发生在 trim 之后：首尾空白不计入字节数', () => {
    expect(countEngineerResponseTextBytes('  abc  ')).toBe(3);
    expect(countEngineerResponseTextBytes('\n\t中 \n')).toBe(3);
  });

  describe('边界：65,535 bytes 合法，65,536 bytes 及以上拒绝', () => {
    it('ASCII "a" × 65,535 合法，× 65,536 拒绝', () => {
      expect(countEngineerResponseTextBytes('a'.repeat(65535))).toBe(65535);
      expect(isEngineerResponseTextOverCapacity('a'.repeat(65535))).toBe(false);

      expect(countEngineerResponseTextBytes('a'.repeat(65536))).toBe(65536);
      expect(isEngineerResponseTextOverCapacity('a'.repeat(65536))).toBe(true);
    });

    it('中文 "中" × 21,845（65,535 bytes）合法，× 21,846（65,538 bytes）拒绝', () => {
      expect(countEngineerResponseTextBytes('中'.repeat(21845))).toBe(65535);
      expect(isEngineerResponseTextOverCapacity('中'.repeat(21845))).toBe(false);

      expect(countEngineerResponseTextBytes('中'.repeat(21846))).toBe(65538);
      expect(isEngineerResponseTextOverCapacity('中'.repeat(21846))).toBe(true);
    });

    it('emoji "😀" × 16,383 + "abc"（65,535 bytes）合法，"😀" × 16,384（65,536 bytes）拒绝', () => {
      expect(countEngineerResponseTextBytes('😀'.repeat(16383) + 'abc')).toBe(65535);
      expect(isEngineerResponseTextOverCapacity('😀'.repeat(16383) + 'abc')).toBe(false);

      expect(countEngineerResponseTextBytes('😀'.repeat(16384))).toBe(65536);
      expect(isEngineerResponseTextOverCapacity('😀'.repeat(16384))).toBe(true);
    });

    it('trim 后恰为 65,535 bytes 的超限原文（外加空白）判定为合法', () => {
      // 未 trim 时 65,539 bytes（超限），trim 后恰为 65,535 bytes（合法）
      const text = `  ${'a'.repeat(65535)}  `;
      expect(text.length).toBe(65539);
      expect(isEngineerResponseTextOverCapacity(text)).toBe(false);
    });
  });
});
