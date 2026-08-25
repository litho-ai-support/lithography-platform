// src/core/common/numeric/decimal.spec.ts
import { decimalCompute } from '@core/common/numeric/decimal';

/**
 * 断言辅助：将十进制数按固定精度进行 half-up 舍入，用于期望值计算。
 * 注意：内部加微量偏移以避免二进制浮点在 .5 临界处的微小偏差。
 * @param value 十进制 number 值
 * @param scale 固定小数位数
 */
function roundHalfUp(value: number, scale: number): number {
  const factor = Math.pow(10, scale);
  const EPS = 1e-12;
  const adjusted = value * factor + EPS;
  const intVal = Math.round(adjusted);
  return intVal / factor;
}

/**
 * decimalPlaces 的基本行为：整数返回 0，小数返回合理位数估计。
 */
describe('统一入口 decimalCompute：加法与减法', () => {
  it('加法：十进制输入自动选择位数（取两者有效位最大值）', () => {
    const a = 1.2345;
    const b = 2.1;
    const res = decimalCompute({ op: 'add', a, b });
    expect(res).toBeCloseTo(roundHalfUp(a + b, 4), 10);
  });

  it('加法：两侧都是十进制，自动按运算位输出', () => {
    const a = 100.12; // 金额两位
    const b = 1.2345; // 四位系数
    const res = decimalCompute({ op: 'add', a, b });
    expect(res).toBeCloseTo(roundHalfUp(a + b, 4), 10);
  });

  it('加法：可选 outScale 控制输出位', () => {
    const a = 1.2;
    const b = 2.3456;
    const res = decimalCompute({ op: 'add', a, b, outScale: 2 });
    expect(res).toBeCloseTo(roundHalfUp(a + b, 2), 10);
  });

  it('减法：十进制输入自动选择位数（取两者有效位最大值）', () => {
    const a = 3.4567;
    const b = 1.2;
    const res = decimalCompute({ op: 'sub', a, b });
    expect(res).toBeCloseTo(roundHalfUp(a - b, 4), 10);
  });

  it('减法：统一入口按 outScale 输出', () => {
    const a = 100.12; // 金额两位
    const b = 1.2345; // 四位系数
    const res = decimalCompute({ op: 'sub', a, b, outScale: 2 });
    expect(res).toBeCloseTo(roundHalfUp(a - b, 2), 10);
  });
});

/**
 * 基础加减：统一入口验证二进制浮点误差规避。
 */
describe('统一入口 decimalCompute：基础加减', () => {
  it('0.1 + 0.2 精确到两位', () => {
    const res = decimalCompute({ op: 'add', a: 0.1, b: 0.2, outScale: 2 });
    expect(res).toBeCloseTo(0.3, 10);
  });

  it('0.3 - 0.1 精确到两位', () => {
    const res = decimalCompute({ op: 'sub', a: 0.3, b: 0.1, outScale: 2 });
    expect(res).toBeCloseTo(0.2, 10);
  });
});

// 统一入口已覆盖基础加减，不再直接测试内部 helper。

/**
 * mulScaledInts 的舍入精度转换：覆盖 half-up / floor / ceil / trunc 与正负乘积。
 */
describe('统一入口 decimalCompute：乘法与精度', () => {
  it('普通乘法结果与精度（half-up）', () => {
    const a = 1.234;
    const b = 2.5;
    const res = decimalCompute({ op: 'mul', a, b, outScale: 3 });
    expect(res).toBeCloseTo(roundHalfUp(a * b, 3), 10);
  });

  it('长小数位乘法自动降精度避免越界（期望按 outScale half-up）', () => {
    const a = 25.34141432;
    const b = 63.323423423;
    const outScale = 4;
    const res = decimalCompute({ op: 'mul', a, b, outScale });
    expect(res).toBeCloseTo(roundHalfUp(a * b, outScale), 4);
  });

  it('乘法：默认输出位为两者小数位之和（不超过 MAX_SCALE）', () => {
    const a = 123.45; // 两位
    const b = 1.2345; // 四位
    const res = decimalCompute({ op: 'mul', a, b });
    // 未指定 outScale 时，默认按 a/b 的小数位之和（2 + 4 = 6）输出
    expect(res).toBeCloseTo(roundHalfUp(a * b, 6), 10);
  });
});

/**
 * mulDecimals / mulDecimalsAuto：覆盖普通小数乘法与极端长小数位自动降精度。
 */
describe('.5 临界一致性（half-up）', () => {
  it('正数 .5 half-up', () => {
    const v = 1.235;
    const res = decimalCompute({ op: 'add', a: v, b: 0, outScale: 2 });
    expect(res).toBeCloseTo(1.24, 10);
  });

  it('负数 .5 half-up', () => {
    const v = -1.235;
    const res = decimalCompute({ op: 'add', a: v, b: 0, outScale: 2 });
    expect(res).toBeCloseTo(-1.23, 10);
  });
});

/**
 * 桥接 Helper：A/C 混合加法与乘法，以及显式重定标。
 */
describe('统一入口 decimalCompute：桥接与金额系数', () => {
  it('加法：金额两位与金额两位相加按两位输出', () => {
    const a = 12.34;
    const b = 5.67;
    const res = decimalCompute({ op: 'add', a, b });
    expect(res).toBeCloseTo(roundHalfUp(a + b, 2), 10);
  });

  it('金额乘以系数（两位 × 四位 → 两位）', () => {
    const amountYuan = 100;
    const factor = 1.2345;
    const res = decimalCompute({ op: 'mul', a: amountYuan, b: factor, outScale: 2 });
    expect(res).toBeCloseTo(123.45, 10);
  });
});

// 统一入口下不再比较内部整数化函数的一致性。

// 金额乘以系数已通过统一入口覆盖。

/**
 * safeToScaledInt：自动降低精度以保证安全整数，过大数值仍会抛错。
 */
describe('统一入口 decimalCompute：极端值与越界处理', () => {
  it('乘法：过大数值在无法降精度时抛错（整数 × 整数）', () => {
    const huge = Number.MAX_SAFE_INTEGER;
    expect(() => decimalCompute({ op: 'mul', a: huge, b: huge, outScale: 0 })).toThrow();
  });
});
