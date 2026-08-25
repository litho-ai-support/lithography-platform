import { THIRD_PARTY_PROVIDER_TOKENS } from '@modules/third-party-auth/contracts/third-party-provider.contract';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WeAppHttpProvider } from './providers/weapp-http.provider';
import { WechatAuthProvider } from './providers/wechat-auth.provider';
import { WEAPP_PROVIDER_OPTIONS, type WeAppProviderOptions } from './weapp-provider.options';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [
    {
      provide: WEAPP_PROVIDER_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): WeAppProviderOptions => ({
        appId: configService.get<string>('WECHAT_APP_ID')?.trim() || undefined,
        appSecret: configService.get<string>('WECHAT_APP_SECRET')?.trim() || undefined,
      }),
    },
    WeAppHttpProvider,
    WechatAuthProvider,
    {
      provide: THIRD_PARTY_PROVIDER_TOKENS.WEAPP,
      useExisting: WeAppHttpProvider,
    },
    {
      provide: THIRD_PARTY_PROVIDER_TOKENS.WECHAT,
      useExisting: WechatAuthProvider,
    },
  ],
  exports: [THIRD_PARTY_PROVIDER_TOKENS.WEAPP, THIRD_PARTY_PROVIDER_TOKENS.WECHAT],
})
export class ThirdPartyAuthInfrastructureModule {}
