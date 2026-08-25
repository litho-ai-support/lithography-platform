import { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import {
  THIRD_PARTY_PROVIDER_TOKENS,
  ThirdPartyProvider,
  WeAppProviderContract,
} from './contracts/third-party-provider.contract';
import { ThirdPartyAuthQueryService } from './queries/third-party-auth.query.service';
import { IdentityExternalAccountCapabilityAnchor } from './third-party-auth.capability';
import { ThirdPartyAuthEntity } from './third-party-auth.entity';
import { PROVIDER_MAP, ThirdPartyAuthService } from './third-party-auth.service';
import { ThirdPartyAuthInfrastructureModule } from '@src/infrastructure/third-party-auth/third-party-auth-infrastructure.module';

/**
 * 第三方认证提供者映射工厂
 * 创建平台类型到具体提供者实现的映射关系
 */
const providerMapFactory: Provider = {
  provide: PROVIDER_MAP,
  useFactory: (weapp: WeAppProviderContract, wechat: ThirdPartyProvider) => {
    // 构建第三方平台类型到提供者实现的映射
    const map = new Map<ThirdPartyProviderEnum, ThirdPartyProvider>([
      [weapp.provider, weapp],
      [wechat.provider, wechat],
      // TODO: 添加更多第三方平台支持 (GitHub、Google、QQ 等)
    ]);
    return map;
  },
  inject: [THIRD_PARTY_PROVIDER_TOKENS.WEAPP, THIRD_PARTY_PROVIDER_TOKENS.WECHAT],
};

/**
 * 第三方认证模块
 * 提供统一的第三方平台认证、绑定、解绑等功能
 */
@Module({
  imports: [TypeOrmModule.forFeature([ThirdPartyAuthEntity]), ThirdPartyAuthInfrastructureModule],
  providers: [
    IdentityExternalAccountCapabilityAnchor,
    providerMapFactory,
    ThirdPartyAuthService,
    ThirdPartyAuthQueryService,
  ],
  exports: [ThirdPartyAuthService, ThirdPartyAuthQueryService],
})
export class ThirdPartyAuthModule {}
