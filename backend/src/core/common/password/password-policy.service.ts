// src/core/common/password/password-policy.service.ts

/**
 * 密码策略配置
 */
export interface PasswordPolicyConfig {
  /** 最小长度 */
  minLength: number;
  /** 最大长度 */
  maxLength: number;
  /** 是否需要包含小写字母 */
  requireLowercase: boolean;
  /** 是否需要包含大写字母 */
  requireUppercase: boolean;
  /** 是否需要包含数字 */
  requireNumbers: boolean;
  /** 是否需要包含特殊字符 */
  requireSpecialChars: boolean;
  /** 是否检查常见密码黑名单 */
  checkBlacklist: boolean;
}

type PasswordPolicyCharRequirementKey = Extract<
  keyof PasswordPolicyConfig,
  'requireLowercase' | 'requireUppercase' | 'requireNumbers' | 'requireSpecialChars'
>;

interface PasswordCharTypeCheck {
  regex: RegExp;
  configKey: PasswordPolicyCharRequirementKey;
  errorMessage: string;
  strengthBonus: number;
}

/**
 * 密码校验结果
 */
export interface PasswordValidationResult {
  /** 是否通过校验 */
  isValid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 密码强度评分 (0-100) */
  strength: number;
}

/**
 * 密码策略服务
 * 提供统一的密码复杂度校验和安全策略
 */
export class PasswordPolicyService {
  /**
   * 默认密码策略配置
   */
  private readonly defaultConfig: PasswordPolicyConfig = {
    minLength: 8,
    maxLength: 128,
    requireLowercase: true,
    requireUppercase: false, // 不强制大写，降低用户负担
    requireNumbers: true,
    requireSpecialChars: true,
    checkBlacklist: true,
  };

  /**
   * 常见弱密码黑名单
   * 包含最常见的弱密码模式
   */
  private readonly commonWeakPasswords = new Set([
    // 数字序列
    '12345678',
    '123456789',
    '1234567890',
    '87654321',

    // 键盘序列
    'qwerty123',
    'qwertyui',
    'asdfghjk',
    'zxcvbnm123',
    'qwer1234',
    'asdf1234',

    // 常见密码
    'password',
    'password123',
    'admin123',
    'root123',
    'user123',
    'test123',
    'welcome123',
    'login123',

    // 重复字符
    'aaaaaaaa',
    '11111111',
    '00000000',
  ]);

  /**
   * 字符类型检查配置映射
   */
  private readonly charTypeChecks = new Map<string, PasswordCharTypeCheck>([
    [
      'lowercase',
      {
        regex: /[a-z]/,
        configKey: 'requireLowercase',
        errorMessage: '密码必须包含小写字母',
        strengthBonus: 15,
      },
    ],
    [
      'uppercase',
      {
        regex: /[A-Z]/,
        configKey: 'requireUppercase',
        errorMessage: '密码必须包含大写字母',
        strengthBonus: 15,
      },
    ],
    [
      'numbers',
      {
        regex: /\d/,
        configKey: 'requireNumbers',
        errorMessage: '密码必须包含数字',
        strengthBonus: 20,
      },
    ],
    [
      'specialChars',
      {
        regex: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/,
        configKey: 'requireSpecialChars',
        errorMessage: '密码必须包含特殊字符 (!@#$%^&* 等)',
        strengthBonus: 20,
      },
    ],
  ]);

  /**
   * 验证密码是否符合策略要求
   *
   * @param password 待验证的密码
   * @param config 密码策略配置（可选，使用默认配置）
   * @returns 验证结果
   */
  validatePassword(
    password: string,
    config: Partial<PasswordPolicyConfig> = {},
  ): PasswordValidationResult {
    // 预处理：trim 并拒绝纯空白密码
    if (!password || !password.trim()) {
      return {
        isValid: false,
        errors: ['密码不能为空或纯空白字符'],
        strength: 0,
      };
    }

    // NFKC 规范化处理，避免全角/兼容字符绕过
    const normalizedPassword = password.normalize('NFKC');

    // 检查首尾空格
    if (normalizedPassword !== normalizedPassword.trim()) {
      return {
        isValid: false,
        errors: ['密码首尾不能包含空格'],
        strength: 0,
      };
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    const errors: string[] = [];
    let strength = 0;

    // 基础长度检查
    const lengthValidation = this.validateLength(normalizedPassword, finalConfig);
    errors.push(...lengthValidation.errors);
    strength += lengthValidation.strengthBonus;

    // 字符类型检查
    const charTypeValidation = this.validateCharTypes(normalizedPassword, finalConfig);
    errors.push(...charTypeValidation.errors);
    strength += charTypeValidation.strengthBonus;

    // 字符多样性加分
    if (charTypeValidation.charTypeCount >= 3) {
      strength += 10; // 包含 3 种以上字符类型 +10 分
    }

    // 长度加分
    if (normalizedPassword.length >= 12) {
      strength += 10; // 长度 >= 12 +10 分
    }

    // 黑名单检查
    const blacklistValidation = this.validateBlacklist(normalizedPassword, finalConfig);
    errors.push(...blacklistValidation.errors);
    strength = Math.min(strength, blacklistValidation.maxStrength);

    // 模式检查（重复字符和连续字符）
    const patternValidation = this.validatePatterns(normalizedPassword);
    errors.push(...patternValidation.errors);
    strength = Math.min(strength, patternValidation.maxStrength);

    return {
      isValid: errors.length === 0,
      errors,
      strength: Math.min(strength, 100),
    };
  }

  /**
   * 验证密码长度
   */
  private validateLength(
    password: string,
    config: PasswordPolicyConfig,
  ): { errors: string[]; strengthBonus: number } {
    const errors: string[] = [];
    let strengthBonus = 0;

    if (password.length < config.minLength) {
      errors.push(`密码长度至少为 ${config.minLength} 位`);
    } else {
      strengthBonus += 20; // 长度符合要求 +20 分
    }

    if (password.length > config.maxLength) {
      errors.push(`密码长度不能超过 ${config.maxLength} 位`);
    }

    return { errors, strengthBonus };
  }

  /**
   * 验证字符类型
   */
  private validateCharTypes(
    password: string,
    config: PasswordPolicyConfig,
  ): { errors: string[]; strengthBonus: number; charTypeCount: number } {
    const errors: string[] = [];
    let strengthBonus = 0;
    let charTypeCount = 0;

    for (const [, checkConfig] of this.charTypeChecks) {
      const hasCharType = checkConfig.regex.test(password);

      if (hasCharType) {
        charTypeCount++;
        strengthBonus += checkConfig.strengthBonus;
      } else if (config[checkConfig.configKey]) {
        errors.push(checkConfig.errorMessage);
      }
    }

    return { errors, strengthBonus, charTypeCount };
  }

  /**
   * 验证黑名单
   */
  private validateBlacklist(
    password: string,
    config: PasswordPolicyConfig,
  ): { errors: string[]; maxStrength: number } {
    const errors: string[] = [];
    let maxStrength = 100;

    if (!config.checkBlacklist) {
      return { errors, maxStrength };
    }

    const lowerPassword = password.toLowerCase();

    // 检查完全匹配
    if (this.commonWeakPasswords.has(lowerPassword)) {
      errors.push('密码过于常见，请使用更复杂的密码');
      maxStrength = 30; // 黑名单密码强度不超过 30
    }

    // 检查包含常见弱密码片段
    for (const weakPassword of this.commonWeakPasswords) {
      if (weakPassword.length >= 6 && lowerPassword.includes(weakPassword)) {
        errors.push('密码包含常见的弱密码片段，请避免使用');
        maxStrength = Math.min(maxStrength, 50); // 包含弱密码片段强度不超过 50
        break;
      }
    }

    return { errors, maxStrength };
  }

  /**
   * 验证密码模式（重复字符和连续字符）
   */
  private validatePatterns(password: string): { errors: string[]; maxStrength: number } {
    const errors: string[] = [];
    let maxStrength = 100;

    // 重复字符检查
    if (this.hasRepeatingChars(password)) {
      errors.push('密码不能包含过多重复字符');
      maxStrength = Math.min(maxStrength, 60);
    }

    // 连续字符检查
    if (this.hasSequentialChars(password)) {
      errors.push('密码不能包含连续的字符序列');
      maxStrength = Math.min(maxStrength, 60);
    }

    return { errors, maxStrength };
  }

  /**
   * 检查是否包含过多重复字符
   *
   * @param password 密码
   * @returns 是否包含过多重复字符
   */
  private hasRepeatingChars(password: string): boolean {
    // 检查是否有连续 3 个以上相同字符
    for (let i = 0; i <= password.length - 3; i++) {
      if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查是否包含连续字符序列
   *
   * @param password 密码
   * @returns 是否包含连续字符序列
   */
  private hasSequentialChars(password: string): boolean {
    const sequences = [
      '0123456789',
      '9876543210',
      'abcdefghijklmnopqrstuvwxyz',
      'zyxwvutsrqponmlkjihgfedcba',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'ZYXWVUTSRQPONMLKJIHGFEDCBA',
      'qwertyuiop',
      'poiuytrewq',
      'asdfghjkl',
      'lkjhgfdsa',
      'zxcvbnm',
      'mnbvcxz',
    ];

    const lowerPassword = password.toLowerCase();

    // 检查是否包含 4 个以上连续字符
    for (const sequence of sequences) {
      for (let i = 0; i <= sequence.length - 4; i++) {
        const subSeq = sequence.substring(i, i + 4);
        if (lowerPassword.includes(subSeq)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 获取密码强度描述
   *
   * @param strength 强度评分 (0-100)
   * @returns 强度描述
   */
  getStrengthDescription(strength: number): string {
    if (strength >= 80) return '强';
    if (strength >= 60) return '中等';
    if (strength >= 40) return '较弱';
    return '弱';
  }

  /**
   * 生成密码建议
   *
   * @param errors 验证错误列表
   * @returns 改进建议
   */
  generatePasswordSuggestions(errors: string[]): string[] {
    const suggestions: string[] = [];

    if (errors.some((e) => e.includes('长度'))) {
      suggestions.push('使用至少 8 个字符的密码');
    }

    if (errors.some((e) => e.includes('小写字母'))) {
      suggestions.push('添加小写字母 (a-z)');
    }

    if (errors.some((e) => e.includes('大写字母'))) {
      suggestions.push('添加大写字母 (A-Z)');
    }

    if (errors.some((e) => e.includes('数字'))) {
      suggestions.push('添加数字 (0-9)');
    }

    if (errors.some((e) => e.includes('特殊字符'))) {
      suggestions.push('添加特殊字符 (!@#$%^&* 等)');
    }

    if (errors.some((e) => e.includes('常见') || e.includes('弱密码'))) {
      suggestions.push('避免使用常见密码，创建独特的密码组合');
    }

    if (errors.some((e) => e.includes('重复') || e.includes('连续'))) {
      suggestions.push('避免重复字符和连续字符序列');
    }

    return suggestions;
  }
}
