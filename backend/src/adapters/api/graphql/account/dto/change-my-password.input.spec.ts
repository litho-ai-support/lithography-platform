// src/adapters/api/graphql/account/dto/change-my-password.input.spec.ts

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ChangeMyPasswordInput } from './change-my-password.input';

describe('ChangeMyPasswordInput', () => {
  it('协议层只保留字符串与非空约束：弱密码通过协议校验，策略裁决唯一归 Usecase 层', async () => {
    // 生产环境错误分类的协议面事实：不设 IsValidPassword 协议级强度预检——
    // 否则弱密码走 HttpException 路径，生产环境下其分类会被收敛为
    // INTERNAL_SERVER_ERROR；到达 Usecase 后经 PasswordPolicyService 抛
    // DomainError（INPUT_NORMALIZE_ERROR.INVALID_TEXT → BAD_USER_INPUT），
    // 该路径的分类在生产环境保持不变
    const input = plainToInstance(ChangeMyPasswordInput, {
      currentPassword: 'whatever-current-value',
      newPassword: 'weak',
    });

    const errors = await validate(input);

    expect(errors).toHaveLength(0);
  });

  it('空字符串仍在协议层被拒绝（非空约束保留）', async () => {
    const input = plainToInstance(ChangeMyPasswordInput, {
      currentPassword: '',
      newPassword: '',
    });

    const errors = await validate(input);

    expect(errors.map((error) => error.property).sort()).toEqual([
      'currentPassword',
      'newPassword',
    ]);
  });
});
