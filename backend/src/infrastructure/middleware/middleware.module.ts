// src/infrastructure/middleware/middleware.module.ts

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FormatResponseMiddleware } from './format-response.middleware';

/**
 * 中间件模块
 * 统一管理所有应用级中间件的配置和注册
 */
@Module({
  providers: [FormatResponseMiddleware],
  exports: [FormatResponseMiddleware],
})
export class MiddlewareModule implements NestModule {
  /**
   * 配置中间件
   * @param consumer 中间件消费者
   */
  configure(consumer: MiddlewareConsumer): void {
    // 全局响应格式化中间件
    consumer.apply(FormatResponseMiddleware).forRoutes('*');

    // 未来可以在这里添加更多中间件
    // consumer.apply(AuthMiddleware).forRoutes({ path: '/api/*', method: RequestMethod.ALL });
    // consumer.apply(LoggingMiddleware).forRoutes('*');
    // consumer.apply(RateLimitMiddleware).forRoutes('/api/*');
  }
}
