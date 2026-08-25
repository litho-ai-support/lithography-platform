// src/modules/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreJwtModule } from '@src/infrastructure/jwt/jwt.module';
import { AuthService } from './auth.service';
import { IdentityAuthenticationCapabilityAnchor } from './auth.capability';
import { AUTH_TOKENS } from './auth.tokens';
import { LoginBootstrapQueryService } from './queries/login-bootstrap.query.service';
import { LoginResultQueryService } from './queries/login-result.query.service';
import { TokenHelper } from './token.helper';

/**
 * 认证模块
 */
@Module({
  imports: [CoreJwtModule],
  providers: [
    IdentityAuthenticationCapabilityAnchor,
    {
      provide: AUTH_TOKENS.JWT_AUDIENCE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): string =>
        configService.get<string>('jwt.audience') ?? '',
    },
    AuthService,
    TokenHelper,
    LoginBootstrapQueryService,
    LoginResultQueryService,
  ],
  exports: [
    AuthService,
    TokenHelper, // 导出 TokenHelper 供其他模块使用
    LoginBootstrapQueryService,
    LoginResultQueryService,
  ],
})
export class AuthModule {}
