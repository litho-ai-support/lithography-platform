// e2e/helpers/visual-evidence.spec.ts
// @vitest-environment node
// PR5 视觉证据收口 helper 的单元测试（Codex S0–S6 Review 修复轮 P1-1 / P3-1）；vitest 运行，
// Playwright 经 testIgnore 排除 helpers 目录。node 环境：helper 内部用 node:fs 读 PNG 头部。
//
// 关键断言：
// - 档位缺省为基准锁定的 M，普通基准截图调用方式不变；
// - S→M→L→M 往返用例显式传入当次真实档位时，文件名必须如实写成 scale-S / scale-M / scale-L，
//   不得出现「S/L 截图却写 scale-M」的元数据失真；
// - 往返中两次 M 档位相同，只靠「区域 + 分钟级时间戳」会覆盖，必须由调用方在「区域」里带步序
//   才能生成互不相同的文件名；
// - PNG 尺寸读取对非法 PNG 必须抛错（防止 e2e 静默取到错误尺寸）。

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildEvidenceFileName,
  EVIDENCE_SCALE_LEVEL,
  EVIDENCE_ZOOM,
  type EvidenceScaleLevel,
  readPngDimensions,
} from './visual-evidence';

const CAPTURED_AT = new Date(2026, 8, 25, 14, 5); // 2026-09-25 14:05 本地时间
const tempDir = mkdtempSync(path.join(tmpdir(), 'visual-evidence-spec-'));

afterAll(() => {
  rmSync(tempDir, { force: true, recursive: true });
});

/** 最小合法 PNG：8 字节签名 + IHDR 头（尺寸位于 offset 16 / 20）。 */
function writeMinimalPng(filePath: string, width: number, height: number): void {
  const buffer = Buffer.alloc(24);

  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  writeFileSync(filePath, buffer);
}

describe('buildEvidenceFileName', () => {
  const baseParams = {
    area: 'pr5-s6-2-create-step-1-dock-S',
    capturedAt: CAPTURED_AT,
    role: 'customer',
    viewportLabel: '1440x900',
  };

  it('缺省档位为基准锁定的 M，普通基准截图调用方式不变', () => {
    const fileName = buildEvidenceFileName(baseParams);

    expect(EVIDENCE_SCALE_LEVEL).toBe('M');
    expect(fileName).toBe(
      'pr5-s6-2-create-step-1-dock-S-viewport-1440x900-scale-M-role-customer-zoom-100-20260925-1405.png',
    );
  });

  it.each<EvidenceScaleLevel>(['S', 'M', 'L'])(
    '显式传入 %s 档时文件名如实标注该档位',
    (scaleLevel) => {
      const fileName = buildEvidenceFileName({ ...baseParams, scaleLevel });

      expect(fileName).toContain(`-scale-${scaleLevel}-`);
      expect(fileName).toContain(`-zoom-${EVIDENCE_ZOOM}-`);
    },
  );

  it('S/L 档截图不得被写成 scale-M（P1-1 元数据失真回归）', () => {
    const small = buildEvidenceFileName({ ...baseParams, scaleLevel: 'S' });
    const large = buildEvidenceFileName({ ...baseParams, scaleLevel: 'L' });

    expect(small).not.toContain('-scale-M-');
    expect(large).not.toContain('-scale-M-');
  });

  it('往返中两次 M 档靠「区域」里的步序生成互不相同的文件名', () => {
    const params = { ...baseParams, capturedAt: CAPTURED_AT, scaleLevel: 'M' as const };
    const firstM = buildEvidenceFileName({ ...params, area: 'pr5-s6-2-create-step-2-dock-M' });
    const lastM = buildEvidenceFileName({ ...params, area: 'pr5-s6-2-create-step-4-dock-M' });

    expect(firstM).not.toBe(lastM);
  });

  it('区域相同、档位相同、时间同分钟时文件名相同（故必须由步序消重）', () => {
    const params = { ...baseParams, scaleLevel: 'M' as const };
    const first = buildEvidenceFileName(params);
    const second = buildEvidenceFileName(params);

    expect(first).toBe(second);
  });
});

describe('readPngDimensions', () => {
  it('从合法 PNG 头部读出物理尺寸', () => {
    const filePath = path.join(tempDir, 'valid.png');

    writeMinimalPng(filePath, 1440, 900);

    expect(readPngDimensions(filePath)).toEqual({ height: 900, width: 1440 });
  });

  it('非 PNG 内容必须抛错，不得静默返回错误尺寸', () => {
    const filePath = path.join(tempDir, 'not-a-png.png');

    writeFileSync(filePath, 'not a png at all, definitely longer than 24 bytes');

    expect(() => readPngDimensions(filePath)).toThrow(/不是合法 PNG/);
  });

  it('长度不足 24 字节的内容必须抛错', () => {
    const filePath = path.join(tempDir, 'too-short.png');

    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect(() => readPngDimensions(filePath)).toThrow(/不是合法 PNG/);
  });
});
