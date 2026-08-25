// test/helloWorld.e2e-spec.skip.ts
// test/app.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiModule } from '../src/bootstraps/api/api.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET) - 应该返回 Hello World!', () => {
    return request(app.getHttpServer() as App)
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
