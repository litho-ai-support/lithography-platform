// src/core/common/numeric/decimal.ts
/**
 * 十进制定点计算工具（纯函数，无副作用）
 *
 * 目标与术语：
 * - 以固定小数位（scale）进入“整数域”运算，避免二进制浮点误差；在进入/退出整数域或精度转换时按舍入法稳定到目标位。
 * - `scale` 表示以 10 的幂进行缩放；`mode` 表示舍入方法（half-up / floor / ceil / trunc）。
 *
 * 使用示例（唯一顶层入口，仅四个参数）：
 * - 统一入口（按操作符调度）：
 *   `decimalCompute({ op: 'add', a: 0.1, b: 0.2 })`、
 *   `decimalCompute({ op: 'mul', a: 1.23, b: 4.567, outScale: 2 })`。
 *
 * 外部调用仅使用唯一顶层入口 `decimalCompute`；下层函数仅作为内部实现。
 */

export type RoundingMode = 'half-up' | 'floor' | 'ceil' | 'trunc';

/** 最大可用的 10 的次方指数，避免 `factor` 溢出到非安全整数范围 */
const MAX_SCALE = 15; // 10^15 仍在 double 精度下可安全表示为整数（与场景足够）
/** 最大安全整数（ bigInt 版本） */
const MAX_SAFE_INT_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * 取 bigint 的绝对值
 * @param x 输入值
 */
function bigintAbs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

/**
 * 计算 10 的幂（number 版本）
 * @param scale 固定小数位数；若越界则夹紧到 `[0, MAX_SCALE]`
 */
function pow10Number(scale: number): number {
  const s = scale < 0 ? 0 : Math.min(scale, MAX_SCALE);
  return Math.pow(10, s);
}

/**
 * 计算 10 的幂（bigint 版本）
 * @param scale 固定小数位数；若越界则夹紧到 `[0, MAX_SCALE]`
 */
function pow10BigInt(scale: number): bigint {
  const s = scale < 0 ? 0 : Math.min(scale, MAX_SCALE);
  let result = 1n;
  for (let i = 0; i < s; i += 1) result *= 10n;
  return result;
}

/**
 * 估算一个十进制 number 的有效小数位（通过放大到接近整数并检测误差门限）
 * 注意：这不是严格的“输入字符串位数”，而是针对 runtime number 的实用估算。
 * @param value 十进制数值
 * @param maxScale 最大允许的小数位，默认 `MAX_SCALE`
 */
export function decimalPlaces(value: number, maxScale: number = MAX_SCALE): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('输入必须为有限的 number');
  }
  const abs = Math.abs(value);
  if (Number.isInteger(abs)) return 0;
  // 动态误差门限：随放大倍数增加，允许极微小的二进制误差
  for (let s = 1; s <= maxScale; s += 1) {
    const factor = pow10Number(s);
    const scaled = abs * factor;
    const rounded = Math.round(scaled);
    const diff = Math.abs(scaled - rounded);
    // 误差阈值：与因子规模相关，经验取 1e-7
    const epsilon = 1e-7;
    if (diff < epsilon) return s;
  }
  return maxScale;
}

/**
 * 将十进制数按固定位数转换为整数（定点表示），并按指定舍入模式确定最终整数值
 * @param value 十进制数值
 * @param scale 固定小数位数
 * @param mode 舍入模式，默认 half-up（四舍五入）
 */
export function toScaledInt(value: number, scale: number, mode: RoundingMode = 'half-up'): number {
  const factor = pow10Number(scale);
  const scaled = value * factor;
  let result: number;
  switch (mode) {
    case 'floor':
      result = Math.floor(scaled);
      break;
    case 'ceil':
      result = Math.ceil(scaled);
      break;
    case 'trunc':
      result = scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled);
      break;
    case 'half-up':
    default:
      // 由于二进制浮点在临界 .5 处可能出现极微小偏差（如 123.49999999999999 或 -123.50000000000001），
      // 这里统一加一个极小的正偏移，使 half-up 行为贴近 Math.round 的预期，
      // 在正负数 .5 边界都向“上”舍入（正数增大、负数绝对值减小）。
      {
        const EPS = 1e-12;
        const adjusted = scaled + EPS;
        result = Math.round(adjusted);
      }
      break;
  }
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(
      `整数化结果超出安全整数范围 (value=${value}, scale=${scale}, mode=${mode})`,
    );
  }
  return result;
}

/**
 * 安全整数化：当目标 `scale` 导致整数化越界时，自动降低 `scale` 直至安全。
 * @param value 十进制数值
 * @param scale 期望小数位
 * @param mode 舍入模式
 * @returns 定点整数与实际采用的 `scale`
 */
export function safeToScaledInt(
  value: number,
  scale: number,
  mode: RoundingMode = 'half-up',
): { int: number; scale: number } {
  if (!Number.isFinite(value)) throw new RangeError('输入必须为有限的 number');
  // 从目标 scale 开始逐步降低，直到整数化结果为安全整数，最低降到 0 位小数
  for (let s = Math.min(scale, MAX_SCALE); s >= 0; s -= 1) {
    const factor = pow10Number(s);
    const scaled = value * factor;
    let intVal: number;
    switch (mode) {
      case 'floor':
        intVal = Math.floor(scaled);
        break;
      case 'ceil':
        intVal = Math.ceil(scaled);
        break;
      case 'trunc':
        intVal = scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled);
        break;
      case 'half-up':
      default: {
        // 与 toScaledInt 保持 .5 临界一致性（修正二进制浮点极小偏差）
        const EPS = 1e-12;
        const adjusted = scaled + EPS;
        intVal = Math.round(adjusted);
        break;
      }
    }
    if (Number.isSafeInteger(intVal)) {
      return { int: intVal, scale: s };
    }
  }
  throw new RangeError('整数化结果超出安全整数范围，且无法再降低精度');
}

/**
 * 将定点整数恢复为十进制数
 * @param scaledInt 定点整数
 * @param scale 固定小数位数
 */
export function fromScaledInt(scaledInt: number, scale: number): number {
  if (!Number.isSafeInteger(scaledInt)) {
    throw new RangeError(`输入必须为安全整数 (scaledInt=${scaledInt}, scale=${scale})`);
  }
  const factor = pow10Number(scale);
  return scaledInt / factor;
}

/**
 * 两十进制数相加（按同一固定小数位进行运算与舍入）
 * @param a 加数 A
 * @param b 加数 B
 * @param scale 固定小数位
 */
export function addDecimals(a: number, b: number, scale: number): number {
  const ai = toScaledInt(a, scale);
  const bi = toScaledInt(b, scale);
  const sum = ai + bi;
  if (!Number.isSafeInteger(sum))
    throw new RangeError(`加法结果超出安全整数范围 (scale=${scale}, ai=${ai}, bi=${bi})`);
  return fromScaledInt(sum, scale);
}

/**
 * 两十进制数相减（按同一固定小数位进行运算与舍入）
 * @param a 被减数
 * @param b 减数
 * @param scale 固定小数位
 */
export function subDecimals(a: number, b: number, scale: number): number {
  const ai = toScaledInt(a, scale);
  const bi = toScaledInt(b, scale);
  const diff = ai - bi;
  if (!Number.isSafeInteger(diff))
    throw new RangeError(`减法结果超出安全整数范围 (scale=${scale}, ai=${ai}, bi=${bi})`);
  return fromScaledInt(diff, scale);
}

/**
 * 顶层封装：十进制加法。默认自动选择位数（取两者小数位的最大值），并支持可选舍入模式。
 * 使用场景：希望以“十进制加法”方式调用，无需显式管理位数。
 * @param a 加数 A（十进制 number）
 * @param b 加数 B（十进制 number）
 * @param options 可选参数：`scale` 自定义固定位数，`mode` 舍入模式（默认 half-up）。
 */
export function decimalAdd(
  a: number,
  b: number,
  options?: { scale?: number; mode?: RoundingMode },
): number {
  const mode: RoundingMode = options?.mode ?? 'half-up';
  const autoScale = Math.min(MAX_SCALE, Math.max(decimalPlaces(a), decimalPlaces(b)));
  const scale = options?.scale ?? autoScale;
  const ai = toScaledInt(a, scale, mode);
  const bi = toScaledInt(b, scale, mode);
  const sum = ai + bi;
  if (!Number.isSafeInteger(sum))
    throw new RangeError(
      `加法结果超出安全整数范围 (scale=${scale}, mode=${mode}, ai=${ai}, bi=${bi})`,
    );
  return fromScaledInt(sum, scale);
}

/**
 * 顶层封装：十进制减法。默认自动选择位数（取两者小数位的最大值），并支持可选舍入模式。
 * 使用场景：希望以“十进制减法”方式调用，无需显式管理位数。
 * @param a 被减数（十进制 number）
 * @param b 减数（十进制 number）
 * @param options 可选参数：`scale` 自定义固定位数，`mode` 舍入模式（默认 half-up）。
 */
export function decimalSub(
  a: number,
  b: number,
  options?: { scale?: number; mode?: RoundingMode },
): number {
  const mode: RoundingMode = options?.mode ?? 'half-up';
  const autoScale = Math.min(MAX_SCALE, Math.max(decimalPlaces(a), decimalPlaces(b)));
  const scale = options?.scale ?? autoScale;
  const ai = toScaledInt(a, scale, mode);
  const bi = toScaledInt(b, scale, mode);
  const diff = ai - bi;
  if (!Number.isSafeInteger(diff))
    throw new RangeError(
      `减法结果超出安全整数范围 (scale=${scale}, mode=${mode}, ai=${ai}, bi=${bi})`,
    );
  return fromScaledInt(diff, scale);
}

/**
 * 两个定点整数相乘，并按目标固定小数位进行缩放与舍入
 * @param aInt A 的定点整数表示
 * @param aScale A 的小数位
 * @param bInt B 的定点整数表示
 * @param bScale B 的小数位
 * @param outScale 输出小数位
 * @param mode 舍入模式（默认 half-up ）
 */
export function mulScaledInts(
  aInt: number,
  aScale: number,
  bInt: number,
  bScale: number,
  outScale: number,
  mode: RoundingMode = 'half-up',
): number {
  if (!Number.isSafeInteger(aInt) || !Number.isSafeInteger(bInt)) {
    throw new RangeError('输入必须为安全整数');
  }
  const product = BigInt(aInt) * BigInt(bInt);
  const inScale = aScale + bScale;
  const diff = outScale - inScale;

  // 精度不变：直接还原为十进制
  if (diff === 0) {
    const asNum = Number(product);
    if (!Number.isSafeInteger(asNum)) throw new RangeError('乘法结果超出安全整数范围');
    return fromScaledInt(asNum, outScale);
  }

  // 辅助： BigInt 转安全 number
  function toSafeNumber(bi: bigint): number {
    const asNum = Number(bi);
    if (!Number.isSafeInteger(asNum))
      throw new RangeError(
        `乘法结果超出安全整数范围 (aScale=${aScale}, bScale=${bScale}, outScale=${outScale}, diff=${diff})`,
      );
    return asNum;
  }

  // 辅助：根据舍入模式对 BigInt 除法结果进行调整（正负数都符合数学定义）
  function roundQuotient(prod: bigint, div: bigint, rounding: RoundingMode): bigint {
    let q = prod / div;
    const r = prod % div; // 余数与被除数同号
    const isPos = prod >= 0n;
    const absR = r < 0n ? -r : r;
    if (rounding === 'half-up') {
      if (absR * 2n >= div) q = isPos ? q + 1n : q - 1n;
    } else if (rounding === 'ceil') {
      if (isPos && r !== 0n) q += 1n;
    } else if (rounding === 'floor') {
      if (!isPos && r !== 0n) q -= 1n;
    } // trunc 已是向零截断
    return q;
  }

  if (diff < 0) {
    const divisor = pow10BigInt(-diff);
    const q = roundQuotient(product, divisor, mode);
    return fromScaledInt(toSafeNumber(q), outScale);
  }

  // diff > 0：扩大精度（乘以 10^diff）
  const multiplier = pow10BigInt(diff);
  const expanded = product * multiplier;
  return fromScaledInt(toSafeNumber(expanded), outScale);
}

/**
 * 定点整数相除并按目标位数返回十进制结果（使用 BigInt 保证精确整数运算和舍入）。
 * @param aInt 被除数的定点整数值
 * @param aScale 被除数的小数位
 * @param bInt 除数的定点整数值（不可为 0）
 * @param bScale 除数的小数位
 * @param outScale 输出小数位
 * @param mode 舍入模式，默认 half-up
 */
export function divScaledInts(
  aInt: number,
  aScale: number,
  bInt: number,
  bScale: number,
  outScale: number,
  mode: RoundingMode = 'half-up',
): number {
  if (!Number.isSafeInteger(aInt) || !Number.isSafeInteger(bInt)) {
    throw new RangeError('输入必须为安全整数');
  }
  if (bInt === 0) {
    throw new RangeError('除数不能为 0');
  }

  const numerator = BigInt(aInt) * pow10BigInt(bScale + outScale);
  const denominator = BigInt(bInt) * pow10BigInt(aScale);

  function toSafeNumber(bi: bigint): number {
    const asNum = Number(bi);
    if (!Number.isSafeInteger(asNum))
      throw new RangeError(
        `除法结果超出安全整数范围 (aScale=${aScale}, bScale=${bScale}, outScale=${outScale})`,
      );
    return asNum;
  }

  function roundQuotient(dividend: bigint, divisor: bigint, rounding: RoundingMode): bigint {
    let q = dividend / divisor;
    const r = dividend % divisor;
    const isPos = dividend >= 0n;
    const absR = r < 0n ? -r : r;
    if (rounding === 'half-up') {
      if (absR * 2n >= divisor) q = isPos ? q + 1n : q - 1n;
    } else if (rounding === 'ceil') {
      if (isPos && r !== 0n) q += 1n;
    } else if (rounding === 'floor') {
      if (!isPos && r !== 0n) q -= 1n;
    } // trunc 已是向零截断
    return q;
  }

  const q = roundQuotient(numerator, denominator, mode);
  return fromScaledInt(toSafeNumber(q), outScale);
}

/**
 * 自动预判乘法是否越界，并在必要时“降精度”以保证安全：
 * - 先按 `aScale` / `bScale` 整数化，计算乘积。
 * - 判断在目标 `outScale` 下除以 10^(inScale - outScale) 后是否仍超过 `Number.MAX_SAFE_INTEGER`。
 * - 若会越界，则分配额外的“除数指数”（等价于降低输入精度），优先均衡地减少 `aScale` 与 `bScale`。
 * - 如仍不足，则降低 `outScale`（不增加输出精度）。
 * @param a 十进制数 A
 * @param b 十进制数 B
 * @param aScale A 的小数位
 * @param bScale B 的小数位
 * @param outScale 期望输出小数位（若大于 `aScale + bScale` 将被限制为不大于该值）
 * @param mode 舍入模式
 */
export function mulDecimalsAuto(
  a: number,
  b: number,
  aScale: number,
  bScale: number,
  outScale: number,
  mode: RoundingMode = 'half-up',
): number {
  // 限制 outScale 不超过 inScale（避免无意义的精度扩张导致风险倍增）
  let aS = Math.min(Math.max(0, aScale), MAX_SCALE);
  let bS = Math.min(Math.max(0, bScale), MAX_SCALE);
  // 显式 outScale 仅夹紧到 MAX_SCALE，不再强制不超过 aS + bS；
  // 若扩展精度导致越界，将在后续安全检查与兜底循环中逐步降低。
  let oS = Math.min(Math.max(0, outScale), MAX_SCALE);

  const aI = toScaledInt(a, aS, mode);
  const bI = toScaledInt(b, bS, mode);
  const product = BigInt(aI) * BigInt(bI);
  const inScale = aS + bS;

  // 针对 outScale 与 inScale 的关系，构造需要转换的中间值，作为安全检查基准：
  // - outScale < inScale：先除以 10^(inScale - outScale)
  // - outScale > inScale：先乘以 10^(outScale - inScale)
  const diffOutIn = oS - inScale;
  let scaledForCheck = product;
  if (diffOutIn < 0) {
    const baseDiv = pow10BigInt(-diffOutIn);
    scaledForCheck = product / baseDiv;
  } else if (diffOutIn > 0) {
    const baseMul = pow10BigInt(diffOutIn);
    scaledForCheck = product * baseMul;
  }

  // 判断是否安全：若转换后的中间值仍在安全整数范围，直接计算返回
  if (bigintAbs(scaledForCheck) <= MAX_SAFE_INT_BIGINT) {
    // 直接按当前参数计算
    return mulScaledInts(aI, aS, bI, bS, oS, mode);
  }

  // 需要额外的除数指数，避免越界：逐步增加“额外除数”，等价于降低输入小数位总和
  let extraExp = 0;
  let tmp = bigintAbs(scaledForCheck);
  while (tmp > MAX_SAFE_INT_BIGINT) {
    tmp = tmp / 10n;
    extraExp += 1;
  }

  // 将额外的指数优先均分到 aScale / bScale 的降低上
  let reduceA = Math.floor(extraExp / 2);
  let reduceB = extraExp - reduceA;
  if (reduceA > aS) {
    reduceB += reduceA - aS;
    reduceA = aS;
  }
  if (reduceB > bS) {
    const diff = reduceB - bS;
    reduceB = bS;
    // 尝试把剩余的 diff 分配回 A
    const canMoveToA = Math.min(diff, aS - reduceA);
    reduceA += canMoveToA;
    // 若两侧都到顶仍有剩余，则只能进一步降低输出 outScale
    const stillLeft = diff - canMoveToA;
    if (stillLeft > 0) {
      oS = Math.max(0, oS - stillLeft);
    }
  }

  aS -= reduceA;
  bS -= reduceB;
  // 重新整数化并计算
  const aI2 = toScaledInt(a, aS, mode);
  const bI2 = toScaledInt(b, bS, mode);
  // 再次兜底：如果仍越界，继续降低输出精度直至安全或为 0
  let attemptOut = oS;
  while (true) {
    try {
      return mulScaledInts(aI2, aS, bI2, bS, attemptOut, mode);
    } catch (e) {
      if (attemptOut === 0) throw e as Error;
      attemptOut -= 1;
    }
  }
}

/**
 * 十进制数相除（分别按固定位数整数化后计算），并按目标位数返回结果。
 * 若结果转换为安全整数失败，会自动下降 `outScale` 直至安全或抛错。
 * @param a 十进制数 A（被除数）
 * @param b 十进制数 B（除数，不能为 0）
 * @param aScale A 的小数位
 * @param bScale B 的小数位
 * @param outScale 输出小数位
 * @param mode 舍入模式（默认 half-up ）
 */
export function divDecimalsAuto(
  a: number,
  b: number,
  aScale: number,
  bScale: number,
  outScale: number,
  mode: RoundingMode = 'half-up',
): number {
  if (b === 0) throw new RangeError('除数不能为 0');
  const aS = Math.min(Math.max(0, aScale), MAX_SCALE);
  const bS = Math.min(Math.max(0, bScale), MAX_SCALE);
  const oS = Math.min(Math.max(0, outScale), MAX_SCALE);

  const aInt = toScaledInt(a, aS, mode);
  const bInt = toScaledInt(b, bS, mode);
  if (bInt === 0) throw new RangeError('除数不能为 0');

  function roundQuotient(dividend: bigint, divisor: bigint, rounding: RoundingMode): bigint {
    let q = dividend / divisor;
    const r = dividend % divisor;
    const isPos = dividend >= 0n;
    const absR = r < 0n ? -r : r;
    if (rounding === 'half-up') {
      if (absR * 2n >= divisor) q = isPos ? q + 1n : q - 1n;
    } else if (rounding === 'ceil') {
      if (isPos && r !== 0n) q += 1n;
    } else if (rounding === 'floor') {
      if (!isPos && r !== 0n) q -= 1n;
    } // trunc 已是向零截断
    return q;
  }

  let attemptOut = oS;
  while (true) {
    const numerator = BigInt(aInt) * pow10BigInt(bS + attemptOut);
    const denominator = BigInt(bInt) * pow10BigInt(aS);
    const q = roundQuotient(numerator, denominator, mode);
    const absQ = q < 0n ? -q : q;
    if (absQ <= MAX_SAFE_INT_BIGINT) {
      const asNum = Number(q);
      return fromScaledInt(asNum, attemptOut);
    }
    if (attemptOut === 0) {
      throw new RangeError('除法结果超出安全整数范围');
    }
    attemptOut -= 1;
  }
}

/**
 * 十进制数相乘（分别按固定位数整数化后再计算），并按目标位数返回结果
 * @param a 十进制数 A
 * @param b 十进制数 B
 * @param aScale A 的小数位
 * @param bScale B 的小数位
 * @param outScale 输出小数位
 * @param mode 舍入模式（默认 half-up ）
 */
export function mulDecimals(
  a: number,
  b: number,
  aScale: number,
  bScale: number,
  outScale: number,
  mode: RoundingMode = 'half-up',
): number {
  const aInt = toScaledInt(a, aScale, mode);
  const bInt = toScaledInt(b, bScale, mode);
  return mulScaledInts(aInt, aScale, bInt, bScale, outScale, mode);
}

/**
 * 便捷函数：金额（元，2 位） × 系数（4 位），返回金额（元，2 位）
 * @param amountYuan 金额（元）
 * @param factor 系数（比例）
 * @param mode 舍入模式（默认 half-up ）
 */
export function multiplyMoneyByFactor(
  amountYuan: number,
  factor: number,
  mode: RoundingMode = 'half-up',
): number {
  return mulDecimals(amountYuan, factor, 2, 4, 2, mode);
}

/**
 * 重定标一个定点整数到新的小数位（通过乘以 1 并在边界处进行舍入）。
 * 该方法用于 A ↔ C 桥接时的显式精度转换，避免中途多次舍入。
 * @param params 输入参数对象
 * - intValue 定点整数值（安全整数）
 * - fromScale 当前小数位
 * - toScale 目标小数位
 * - mode 舍入模式
 */
export function rescaleScaledInt(params: {
  intValue: number;
  fromScale: number;
  toScale: number;
  mode?: RoundingMode;
}): number {
  const { intValue, fromScale, toScale, mode = 'half-up' } = params;
  if (!Number.isSafeInteger(intValue))
    throw new RangeError(
      `输入必须为安全整数 (intValue=${intValue}, fromScale=${fromScale}, toScale=${toScale})`,
    );
  // 通过“整数 → 十进制 → 目标精度整数”的路径进行重定标，保证边界舍入一致
  const decimal = fromScaledInt(intValue, fromScale);
  return toScaledInt(decimal, toScale, mode);
}

/**
 * 混合加法桥接：将十进制数规范化到运算精度，与定点整数相加，并按输出精度返回。
 * @param params 输入参数对象
 * - aInt A 的定点整数
 * - aScale A 的小数位
 * - bDecimal B 的十进制数
 * - opScale 运算层目标精度（建议不小于 aScale，不大于 MAX_SCALE）
 * - outScale 输出精度（A 或 C 均可按需要指定）
 * - mode 舍入模式
 */
export function addIntAndDecimal(params: {
  aInt: number;
  aScale: number;
  bDecimal: number;
  opScale: number;
  outScale: number;
  mode?: RoundingMode;
}): number {
  const { aInt, aScale, bDecimal, opScale, outScale, mode = 'half-up' } = params;
  if (!Number.isFinite(bDecimal)) throw new RangeError('输入必须为有限的 number');
  if (!Number.isSafeInteger(aInt))
    throw new RangeError(`输入必须为安全整数 (aInt=${aInt}, aScale=${aScale})`);
  const sOp = Math.min(Math.max(0, opScale), MAX_SCALE);
  const aOp = rescaleScaledInt({ intValue: aInt, fromScale: aScale, toScale: sOp, mode });
  const bOp = toScaledInt(bDecimal, sOp, mode);
  const sum = aOp + bOp;
  if (!Number.isSafeInteger(sum))
    throw new RangeError(
      `加法结果超出安全整数范围 (opScale=${sOp}, outScale=${outScale}, aOp=${aOp}, bOp=${bOp})`,
    );
  // 将 opScale 下的整数和，按 outScale 边界进行一次性舍入与还原
  return mulScaledInts(sum, sOp, 1, 0, outScale, mode);
}

/**
 * 混合乘法桥接：将十进制数规范化到运算精度，与定点整数相乘，并按输出精度返回。
 * 若检测到潜在越界或极端长小数位，内部自动切换到 mulDecimalsAuto。
 * @param params 输入参数对象
 * - aInt A 的定点整数
 * - aScale A 的小数位
 * - bDecimal B 的十进制数
 * - opScale 运算层目标精度（建议不小于 aScale，不大于 MAX_SCALE）
 * - outScale 输出精度
 * - mode 舍入模式
 */
export function mulIntByDecimal(params: {
  aInt: number;
  aScale: number;
  bDecimal: number;
  opScale: number;
  outScale: number;
  mode?: RoundingMode;
}): number {
  const { aInt, aScale, bDecimal, opScale, outScale, mode = 'half-up' } = params;
  if (!Number.isFinite(bDecimal)) throw new RangeError('输入必须为有限的 number');
  if (!Number.isSafeInteger(aInt))
    throw new RangeError(`输入必须为安全整数 (aInt=${aInt}, aScale=${aScale})`);
  const sOp = Math.min(Math.max(0, opScale), MAX_SCALE);
  // 先尝试常规路径：把 B 规范到 sOp，与 A 乘法，再转换到 outScale
  try {
    const bOp = toScaledInt(bDecimal, sOp, mode);
    // 先把 A 重定标到 sOp（乘以 1 触发精度转换与舍入）
    const aOp = rescaleScaledInt({ intValue: aInt, fromScale: aScale, toScale: sOp, mode });
    return mulScaledInts(aOp, sOp, bOp, sOp, outScale, mode);
  } catch {
    // 极端场景：直接走自动预测与降精度路径，基于十进制 A 值避免重复误差
    const aDecimal = fromScaledInt(aInt, aScale);
    const aS = sOp; // 保持与 opScale 接近的输入位数估计
    const bS = sOp;
    return mulDecimalsAuto(aDecimal, bDecimal, aS, bS, outScale, mode);
  }
}

/**
 * 判别联合：统一入口的参数类型，根据 `op` 路由到对应的实现。
 * - add：十进制加法，`scale` 默认取两者有效位最大值。
 * - sub：十进制减法，`scale` 默认取两者有效位最大值。
 * - mul：十进制乘法，默认安全路径（自动降精度），最多仅支持 4 个参数：`op`、`a`、`b`、`outScale`（可选）。输入位自动估算，舍入默认 half-up。
 * - add-mixed：整数域 + 十进制混合加法，`opScale` 默认取 `max(aScale, decimalPlaces(bDecimal))`。
 * - mul-mixed：整数域 × 十进制混合乘法，`opScale` 默认取 `max(aScale, decimalPlaces(bDecimal))`。
 * - rescale：定点整数的精度重定标，默认返回整数；如需十进制，设置 `as: 'decimal'`。
 */
/**
 * 统一入口参数：仅支持十进制 number 入参。
 * - `op`：操作符，支持 `add` / `sub` / `mul`
 * - `a`、`b`：十进制数值，由内部自动整数化与精度判定
 * - `outScale`：输出位（可选）；未指定时按自动预判规则输出
 */
export type DecimalComputeParams = {
  op: 'add' | 'sub' | 'mul' | 'div';
  a: number;
  b: number;
  outScale?: number;
};

/**
 * 统一入口：根据操作符进行十进制定点运算调度。
 * 说明：
 * - 加/减：使用整数域加减避免二进制浮点误差，返回十进制。
 * - 乘法：默认使用自动降精度以规避越界，返回十进制；可通过 `safe: false` 切换到普通乘法。
 * - 混合：桥接整数域与十进制，内部统一到运算位后再按输出位还原为十进制。
 * - 重定标：对定点整数进行位数转换，默认返回整数；可选 `as: 'decimal'` 返回十进制。
 * @param params 判别联合参数，包含操作符与对应操作的所需参数。
 */
export function decimalCompute(params: DecimalComputeParams): number {
  switch (params.op) {
    case 'add':
      return computeAdd(params.a, params.b, params.outScale);
    case 'sub':
      return computeSub(params.a, params.b, params.outScale);
    case 'mul':
      return computeMul(params.a, params.b, params.outScale);
    case 'div':
      return computeDiv(params.a, params.b, params.outScale);
    default: {
      const exhaustive: never = params.op;
      throw new Error(`不支持的操作符: ${String(exhaustive)}`);
    }
  }
}

/**
 * 加法分发：自动判别 `a`/`b` 类型，统一到运算位，按输出位还原。
 * @param a 十进制 number 或定点对象 `{ int, scale }`
 * @param b 十进制 number 或定点对象 `{ int, scale }`
 * @param outScale 可选输出位，默认取运算位
 */
function computeAdd(a: number, b: number, outScale?: number): number {
  const aNum = a;
  const bNum = b;
  const auto = outScale ?? Math.min(MAX_SCALE, Math.max(decimalPlaces(aNum), decimalPlaces(bNum)));
  return addDecimals(aNum, bNum, auto);
}

/**
 * 减法分发：自动判别 `a`/`b` 类型，统一到运算位，按输出位还原。
 * @param a 十进制 number 或定点对象 `{ int, scale }`
 * @param b 十进制 number 或定点对象 `{ int, scale }`
 * @param outScale 可选输出位，默认取运算位
 */
function computeSub(a: number, b: number, outScale?: number): number {
  const aNum = a;
  const bNum = b;
  const auto = outScale ?? Math.min(MAX_SCALE, Math.max(decimalPlaces(aNum), decimalPlaces(bNum)));
  return subDecimals(aNum, bNum, auto);
}

/**
 * 除法分发：仅支持 `number` 入参，默认输出位为“结果的自动预判位数”。
 * @param a 十进制 number 被除数
 * @param b 十进制 number 除数（不能为 0）
 * @param outScale 可选输出位；未指定时先以高位试算，再按结果有效位输出
 */
function computeDiv(a: number, b: number, outScale?: number): number {
  if (b === 0) throw new RangeError('除数不能为 0');
  const aScale = decimalPlaces(a);
  const bScale = decimalPlaces(b);
  if (typeof outScale === 'number') {
    return divDecimalsAuto(a, b, aScale, bScale, outScale, 'half-up');
  }
  const trial = MAX_SCALE;
  const high = divDecimalsAuto(a, b, aScale, bScale, trial, 'half-up');
  const autoScale = Math.min(decimalPlaces(high, MAX_SCALE), trial);
  if (autoScale === trial) {
    return high;
  }
  const rounded = toScaledInt(high, autoScale, 'half-up');
  return rounded / pow10Number(autoScale);
}

/**
 * 乘法分发：自动判别 `a`/`b` 类型，十进制乘法选择自动降精度以规避越界。
 * @param a 十进制 number 或定点对象 `{ int, scale }`
 * @param b 十进制 number 或定点对象 `{ int, scale }`
 * @param outScale 可选输出位，默认不超过两者位数之和且不超过 `MAX_SCALE`
 */
/**
 * 乘法分发：仅支持 `number` 入参，十进制乘法选择自动降精度以规避越界。
 * 默认输出位策略：
 * - 未指定 `outScale`：先按 `min(aScale + bScale, MAX_SCALE)` 计算高精度结果，再按结果的有效位输出。
 * - 极端大数：内部会进一步降低输出位直至安全或抛错。
 * @param a 十进制 number A
 * @param b 十进制 number B
 * @param outScale 可选输出位，默认根据结果实际位数自动预判
 */
function computeMul(a: number, b: number, outScale?: number): number {
  const aScale = decimalPlaces(a);
  const bScale = decimalPlaces(b);
  const sumScale = Math.min(aScale + bScale, MAX_SCALE);
  if (typeof outScale === 'number') {
    return mulDecimalsAuto(a, b, aScale, bScale, outScale, 'half-up');
  }
  const high = mulDecimalsAuto(a, b, aScale, bScale, sumScale, 'half-up');
  const autoScale = Math.min(decimalPlaces(high, MAX_SCALE), sumScale);
  if (autoScale === sumScale) {
    return high;
  }
  const rounded = toScaledInt(high, autoScale, 'half-up');
  return rounded / pow10Number(autoScale);
}
// 已移除未使用的类型守卫 isScaledInt，避免未使用标识符的诊断错误。
