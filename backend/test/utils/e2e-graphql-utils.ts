// 文件位置：test/utils/e2e-graphql-utils.ts
import { INestApplication } from '@nestjs/common';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import request from 'supertest';
import { DataSource } from 'typeorm';

/**
 * 执行 GraphQL POST 请求（支持携带变量与授权）
 * @param params 包含 app、query、variables、token 的参数对象
 * @returns supertest 请求对象，便于链式断言
 */
export function postGql(params: {
  readonly app: INestApplication;
  readonly query: string;
  readonly variables?: unknown;
  readonly token?: string;
}): request.Test {
  const { app, query, variables, token } = params;
  const req = request(app.getHttpServer())
    .post('/graphql')
    .send(variables ? { query, variables } : { query });
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

/**
 * 简化版 GraphQL 执行（仅传入查询字符串与可选 token）
 * @param params 包含 app、query、token 的参数对象
 * @returns supertest 请求对象
 */
export function executeGql(params: {
  readonly app: INestApplication;
  readonly query: string;
  readonly token?: string;
}): request.Test {
  return postGql({ app: params.app, query: params.query, token: params.token });
}

/**
 * 使用账号密码登录并返回访问令牌
 * @param params 包含 app、loginName、loginPassword 的参数对象
 * @returns GraphQL 登录返回的 accessToken 字符串
 */
export async function login(params: {
  readonly app: INestApplication;
  readonly loginName: string;
  readonly loginPassword: string;
  readonly type?: LoginTypeEnum;
  readonly audience?: AudienceTypeEnum;
}): Promise<string> {
  const {
    app,
    loginName,
    loginPassword,
    type = LoginTypeEnum.PASSWORD,
    audience = AudienceTypeEnum.DESKTOP,
  } = params;
  const res = await request(app.getHttpServer())
    .post('/graphql')
    .send({
      query: `
        mutation Login($input: AuthLoginInput!) {
          login(input: $input) { accessToken }
        }
      `,
      variables: { input: { loginName, loginPassword, type, audience } },
    })
    .expect(200);
  const token = (res.body as { data?: { login?: { accessToken?: string } } }).data?.login
    ?.accessToken;
  if (!token) throw new Error('登录失败：未获取到 accessToken');
  return token;
}

/**
 * 获取账号 ID（通过登录名查库）
 * @param ds TypeORM 数据源
 * @param loginName 登录名
 * @returns 账号 ID
 */
export async function getAccountIdByLoginName(ds: DataSource, loginName: string): Promise<number> {
  const repo = ds.getRepository(AccountEntity);
  const found = await repo.findOne({ where: { loginName } });
  if (!found) throw new Error(`未找到账号：${loginName}`);
  return found.id;
}

/**
 * 简易异步等待
 * @param ms 毫秒
 * @returns Promise<void>
 */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
