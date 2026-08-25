// src/modules/verification-record/verification-code.helper.ts
import { Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';

export interface VerificationCodeConfig {
  length?: number;
  numeric?: boolean;
  encoding?: 'hex' | 'base64url';
}

@Injectable()
export class VerificationCodeHelper {
  generateCode(config: VerificationCodeConfig = {}): string {
    const { length = 32, numeric = false, encoding = 'base64url' } = config;

    if (numeric) {
      return this.generateNumericCode(length);
    }

    return this.generateTokenString(length, encoding);
  }

  generateTokenByChars(charCount: number): string {
    const bytes = Math.ceil((charCount * 3) / 4);
    const buffer = randomBytes(bytes);

    const base64url = buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return base64url.substring(0, charCount);
  }

  generateEmailCode(): string {
    return this.generateNumericCode(6);
  }

  generateSmsCode(): string {
    return this.generateNumericCode(6);
  }

  generateEmailToken(): string {
    return this.generateTokenByChars(64);
  }

  generatePasswordResetToken(): string {
    return this.generateTokenByChars(64);
  }

  private generateNumericCode(length: number): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += randomInt(0, 10).toString();
    }
    return code;
  }

  private generateTokenString(length: number, encoding: 'hex' | 'base64url'): string {
    const buffer = randomBytes(length);

    if (encoding === 'hex') {
      return buffer.toString('hex');
    }

    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
