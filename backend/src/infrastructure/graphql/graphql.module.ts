// src/infrastructure/graphql/graphql.module.ts

import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';

type ApolloDriverPlugin = NonNullable<ApolloDriverConfig['plugins']>[number];

const asApolloDriverPlugin = (plugin: unknown): ApolloDriverPlugin => {
  // Apollo Server conditional exports can surface separate CJS/ESM private types under ts-jest.
  return plugin as ApolloDriverPlugin;
};

/**
 * GraphQL 配置工厂函数
 * @param config 配置服务实例
 * @returns Apollo GraphQL 配置选项
 */
const createGraphQLConfig = (config: ConfigService): ApolloDriverConfig => {
  const enableSandbox = config.get<boolean>('graphql.playground', false);

  return {
    autoSchemaFile: config.get<string>('graphql.schemaDestination'),
    introspection: config.get<boolean>('graphql.introspection'),
    playground: false,
    sortSchema: config.get<boolean>('graphql.sortSchema'),
    subscriptions: config.get('graphql.subscriptions'),
    plugins: enableSandbox
      ? [asApolloDriverPlugin(ApolloServerPluginLandingPageLocalDefault({ embed: true }))]
      : [asApolloDriverPlugin(ApolloServerPluginLandingPageDisabled())],
    // 将原始请求对象注入到 GraphQL 上下文，供 JwtAuthGuard 与 RolesGuard 读取 Authorization 头
    context: ({ req }: { req: Request }) => ({ req }),
  };
};

/**
 * GraphQL 模块
 * 封装 GraphQL 配置和初始化逻辑
 */
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService, PinoLogger],
      useFactory: createGraphQLConfig,
    }),
  ],
  exports: [GraphQLModule],
})
export class AppGraphQLModule {}
