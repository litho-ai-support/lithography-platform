// src/adapters/api/graphql/registration/registration.resolver.ts
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RegisterWithEmailUsecase } from '@usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@usecases/registration/register-with-third-party.usecase';
import { GetWeappPhoneUsecase } from '@usecases/third-party-accounts/get-weapp-phone.usecase';
import { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { RegisterResult } from './dto/register-result.dto';
import { RegisterInput } from './dto/register.input';
import { ThirdPartyRegisterInput } from './dto/third-party-register.input';

@Resolver()
export class RegistrationResolver {
  constructor(
    private readonly registerWithEmail: RegisterWithEmailUsecase,
    private readonly registerWithThirdParty: RegisterWithThirdPartyUsecase,
    private readonly getWeappPhoneUsecase: GetWeappPhoneUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RegistrationResolver.name);
  }

  @Mutation(() => RegisterResult, { description: '用户注册' })
  @ValidateInput()
  async register(
    @Args('input') input: RegisterInput,
    @Context() context: { req: Request },
  ): Promise<RegisterResult> {
    // 只传递 usecase 关心的"扁平请求形状"，避免把 Express 类型下沉到用例层
    const req = context?.req;
    const clientIp = (() => {
      if (!req) return '';
      const clean = (ip: string | undefined): string => ip?.replace(/^::ffff:/, '').trim() || '';
      const xRealIp = req.headers['x-real-ip'];
      if (xRealIp) {
        const ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
        return clean(ip);
      }
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        const firstIp =
          typeof xForwardedFor === 'string'
            ? xForwardedFor.split(',')[0].trim()
            : Array.isArray(xForwardedFor)
              ? xForwardedFor[0].split(',')[0].trim()
              : '';
        if (firstIp) return firstIp;
      }
      if (req.ip) return req.ip;
      return req.socket?.remoteAddress ?? '';
    })();

    const result = await this.registerWithEmail.execute({
      loginName: input.loginName ?? null,
      loginEmail: input.loginEmail,
      loginPassword: input.loginPassword,
      nickname: input.nickname,
      type: input.type,
      inviteToken: input.inviteToken,
      clientIp,
    });

    return {
      success: result.success,
      message: result.message,
      accountId: result.accountId,
    };
  }

  /**
   * 第三方注册
   */
  @Mutation(() => RegisterResult, { description: '第三方注册' })
  @ValidateInput()
  async thirdPartyRegister(@Args('input') input: ThirdPartyRegisterInput): Promise<RegisterResult> {
    const result = await this.registerWithThirdParty.execute({
      provider: input.provider,
      authCredential: input.authCredential, // 使用正确的字段名
      audience: input.audience,
      email: input.email,
      weAppData: input.weAppData, // 传递整个 weAppData 对象
    });

    // 移除之前单独获取手机号的逻辑，因为现在在注册时就处理了

    return {
      success: result.success,
      message: result.message,
      accountId: result.accountId,
    };
  }
}
