import { AudienceTypeEnum } from '@app-types/models/account.types';
import { DomainError, INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';
import {
  normalizeRegisterWithEmailInput,
  normalizeRegisterWithThirdPartyInput,
  normalizeRegistrationNicknameCandidatesInput,
  normalizeWeappRegisterInput,
  normalizeWeappRegisterParams,
} from './registration-input.normalize';

describe('registration input normalize', () => {
  it('邮箱注册应 trim/lowercase 邮箱，并稳定化昵称', () => {
    expect(
      normalizeRegisterWithEmailInput({
        loginEmail: ' USER@Example.COM ',
        nickname: ' Ｔｅｓｔ　Ｕｓｅｒ🙂 ',
      }),
    ).toEqual({
      loginEmail: 'user@example.com',
      nickname: 'Test User',
    });
  });

  it('邮箱注册缺省或空白昵称应归一化为 undefined', () => {
    expect(
      normalizeRegisterWithEmailInput({
        loginEmail: 'user@example.com',
        nickname: null,
      }),
    ).toEqual({
      loginEmail: 'user@example.com',
      nickname: undefined,
    });

    expect(
      normalizeRegisterWithEmailInput({
        loginEmail: 'user@example.com',
        nickname: undefined,
      }),
    ).toEqual({
      loginEmail: 'user@example.com',
      nickname: undefined,
    });
  });

  it('邮箱注册应拒绝不符合规则的昵称', () => {
    expect(() =>
      normalizeRegisterWithEmailInput({
        loginEmail: 'user@example.com',
        nickname: 'A',
      }),
    ).toThrow(expect.objectContaining({ code: INPUT_NORMALIZE_ERROR.INVALID_TEXT }));
  });

  it('昵称候选项应 trim、过滤空白并去重', () => {
    expect(
      normalizeRegistrationNicknameCandidatesInput({
        providedNickname: '  Alice  ',
        fallbackOptions: [' Alice ', 'Bob', '', 'Bob', null],
      }),
    ).toEqual({
      providedNickname: 'Alice',
      fallbackOptions: ['Alice', 'Bob'],
    });
  });

  it('第三方注册邮箱应允许缺省、null 和空白输入', () => {
    expect(normalizeRegisterWithThirdPartyInput({})).toEqual({ email: undefined });
    expect(normalizeRegisterWithThirdPartyInput({ email: null })).toEqual({ email: undefined });
    expect(normalizeRegisterWithThirdPartyInput({ email: '   ' })).toEqual({ email: undefined });
    expect(normalizeRegisterWithThirdPartyInput({ email: ' USER@Example.COM ' })).toEqual({
      email: 'user@example.com',
    });
  });

  it('weapp 注册应提供稳定默认昵称并归一化参数', () => {
    expect(normalizeWeappRegisterInput()).toEqual({ defaultNickname: '微信用户' });
    expect(
      normalizeWeappRegisterParams({
        authCredential: '  credential  ',
        audience: AudienceTypeEnum.DESKTOP,
      }),
    ).toEqual({
      authCredential: 'credential',
      audience: AudienceTypeEnum.DESKTOP,
    });
  });

  it('weapp 注册应拒绝非法 audience', () => {
    expect(() =>
      normalizeWeappRegisterParams({
        authCredential: 'credential',
        audience: 'MOBILE' as unknown as AudienceTypeEnum,
      }),
    ).toThrow(DomainError);
  });
});
