// src/modules/auth/token.helper.spec.ts

import {
  GenerateAccessTokenParams,
  GenerateRefreshTokenParams,
  JwtPayload,
} from '@app-types/jwt.types';
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { JsonWebTokenError, JwtService, NotBeforeError, TokenExpiredError } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { TokenHelper } from './token.helper';

describe('TokenHelper', () => {
  let tokenHelper: TokenHelper;
  let jwtService: jest.Mocked<JwtService>;
  let logger: jest.Mocked<PinoLogger>;

  // 测试用的模拟数据
  const mockUser = {
    id: 1,
    loginName: 'testuser',
    nickname: 'Test User', // 添加昵称字段
    loginEmail: 'test@example.com',
    accessGroup: ['user', 'admin'],
  };

  const mockJwtPayload: JwtPayload = {
    sub: 1,
    username: 'Test User', // JWT 中的 username 对应 nickname
    email: 'test@example.com',
    accessGroup: ['user', 'admin'],
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 小时后过期
  };

  const mockToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsInVzZXJuYW1lIjoidGVzdHVzZXIifQ.test';

  beforeEach(async () => {
    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    const mockLogger = {
      setContext: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenHelper,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: PinoLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    tokenHelper = module.get<TokenHelper>(TokenHelper);
    jwtService = module.get(JwtService);
    logger = module.get(PinoLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('应该正确初始化并设置 logger 上下文', () => {
      expect(logger.setContext).toHaveBeenCalledWith('TokenHelper');
    });
  });

  describe('generateAccessToken', () => {
    it('应该成功生成 access token', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateAccessTokenParams = {
        payload: mockJwtPayload,
      };

      // Act
      const result = tokenHelper.generateAccessToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          ...mockJwtPayload,
          type: 'access',
        },
        {},
      );
      expect(result).toBe(mockToken);
    });

    it('应该支持自定义过期时间', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateAccessTokenParams = {
        payload: mockJwtPayload,
        expiresIn: '2h',
      };

      // Act
      const result = tokenHelper.generateAccessToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          ...mockJwtPayload,
          type: 'access',
        },
        { expiresIn: '2h' },
      );
      expect(result).toBe(mockToken);
    });

    it('应该支持自定义 audience', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateAccessTokenParams = {
        payload: mockJwtPayload,
        audience: AudienceTypeEnum.SSTSWEB,
      };

      // Act
      const result = tokenHelper.generateAccessToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          ...mockJwtPayload,
          type: 'access',
        },
        { audience: AudienceTypeEnum.SSTSWEB },
      );
      expect(result).toBe(mockToken);
    });

    it('应该支持同时设置 audience 和 expiresIn', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateAccessTokenParams = {
        payload: mockJwtPayload,
        audience: AudienceTypeEnum.SSTSWEAPP,
        expiresIn: '1h',
      };

      // Act
      const result = tokenHelper.generateAccessToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          ...mockJwtPayload,
          type: 'access',
        },
        { audience: AudienceTypeEnum.SSTSWEAPP, expiresIn: '1h' },
      );
      expect(result).toBe(mockToken);
    });

    it('应该在生成失败时记录错误并抛出异常', () => {
      // Arrange
      const error = new Error('签名失败');
      jwtService.sign.mockImplementation(() => {
        throw error;
      });
      const params: GenerateAccessTokenParams = {
        payload: mockJwtPayload,
      };

      // Act & Assert
      expect(() => tokenHelper.generateAccessToken(params)).toThrow(
        'access token 生成失败: 签名失败',
      );
      expect(logger.error).toHaveBeenCalledWith(
        {
          userId: mockJwtPayload.sub,
          tokenType: 'access',
          error: '签名失败',
          payload: mockJwtPayload,
        },
        'access token 生成失败',
      );
    });
  });

  describe('generateRefreshToken', () => {
    it('应该成功生成 refresh token', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateRefreshTokenParams = {
        payload: { sub: mockJwtPayload.sub },
      };

      // Act
      const result = tokenHelper.generateRefreshToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockJwtPayload.sub,
          type: 'refresh',
          tokenVersion: 1,
        },
        {}, // 修复：添加第二个参数（空对象）
      );
      expect(result).toBe(mockToken);
    });

    it('应该支持自定义 token 版本', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateRefreshTokenParams = {
        payload: { sub: mockJwtPayload.sub },
        tokenVersion: 5,
      };

      // Act
      const result = tokenHelper.generateRefreshToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockJwtPayload.sub,
          type: 'refresh',
          tokenVersion: 5,
        },
        {}, // 修复：添加第二个参数（空对象）
      );
      expect(result).toBe(mockToken);
    });

    // 新增：测试 audience 参数
    it('应该支持自定义 audience', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateRefreshTokenParams = {
        payload: { sub: mockJwtPayload.sub },
        audience: AudienceTypeEnum.SSTSWEB,
      };

      // Act
      const result = tokenHelper.generateRefreshToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockJwtPayload.sub,
          type: 'refresh',
          tokenVersion: 1,
        },
        { audience: AudienceTypeEnum.SSTSWEB }, // 修复：包含 audience 参数
      );
      expect(result).toBe(mockToken);
    });

    // 新增：测试同时设置 audience 和 tokenVersion
    it('应该支持同时设置 audience 和 tokenVersion', () => {
      // Arrange
      jwtService.sign.mockReturnValue(mockToken);
      const params: GenerateRefreshTokenParams = {
        payload: { sub: mockJwtPayload.sub },
        audience: AudienceTypeEnum.SSTSWEAPP,
        tokenVersion: 3,
      };

      // Act
      const result = tokenHelper.generateRefreshToken(params);

      // Assert
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockJwtPayload.sub,
          type: 'refresh',
          tokenVersion: 3,
        },
        { audience: AudienceTypeEnum.SSTSWEAPP }, // 修复：包含 audience 参数
      );
      expect(result).toBe(mockToken);
    });

    it('应该在生成失败时记录错误并抛出异常', () => {
      // Arrange
      const error = new Error('签名失败');
      jwtService.sign.mockImplementation(() => {
        throw error;
      });
      const params: GenerateRefreshTokenParams = {
        payload: { sub: mockJwtPayload.sub },
      };

      // Act & Assert
      expect(() => tokenHelper.generateRefreshToken(params)).toThrow(
        'refresh token 生成失败: 签名失败',
      );
      expect(logger.error).toHaveBeenCalledWith(
        {
          userId: mockJwtPayload.sub,
          tokenType: 'refresh',
          error: '签名失败',
          payload: { sub: mockJwtPayload.sub },
        },
        'refresh token 生成失败',
      );
    });
  });

  describe('verifyToken', () => {
    it('应该成功验证并返回 payload', () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockJwtPayload);

      // Act
      const result = tokenHelper.verifyToken({ token: mockToken });

      // Assert
      expect(jwtService.verify).toHaveBeenCalledWith(mockToken);
      expect(result).toEqual(mockJwtPayload);
    });

    it('应该在 token 过期时抛出特定错误', () => {
      // Arrange
      const expiredError = new TokenExpiredError('jwt expired', new Date());
      jwtService.verify.mockImplementation(() => {
        throw expiredError;
      });

      // Act & Assert
      expect(() => tokenHelper.verifyToken({ token: mockToken })).toThrow(
        'Token 已过期: jwt expired',
      );
      expect(logger.error).not.toHaveBeenCalled(); // 过期不记录错误
    });

    it('应该在 token 非法时记录安全错误', () => {
      // Arrange
      const invalidError = new JsonWebTokenError('invalid signature');
      jwtService.verify.mockImplementation(() => {
        throw invalidError;
      });

      // Act & Assert
      expect(() => tokenHelper.verifyToken({ token: mockToken })).toThrow(
        'Token 验证失败: invalid signature',
      );
      expect(logger.error).toHaveBeenCalledWith(
        {
          error: 'invalid signature',
          tokenPrefix: mockToken.substring(0, 20) + '...',
          timestamp: expect.any(String),
        },
        'JWT Token 手动验证失败 - 关注潜在的安全问题',
      );
    });

    it('应该在 token 未生效时记录安全错误', () => {
      // Arrange
      const notBeforeError = new NotBeforeError('jwt not active', new Date());
      jwtService.verify.mockImplementation(() => {
        throw notBeforeError;
      });

      // Act & Assert
      expect(() => tokenHelper.verifyToken({ token: mockToken })).toThrow(
        'Token 验证失败: jwt not active',
      );
      expect(logger.error).toHaveBeenCalledWith(
        {
          error: 'jwt not active',
          tokenPrefix: mockToken.substring(0, 20) + '...',
          timestamp: expect.any(String),
        },
        'JWT Token 手动验证失败 - 关注潜在的安全问题',
      );
    });

    it('应该处理未知错误', () => {
      // Arrange
      const unknownError = new Error('unknown error');
      jwtService.verify.mockImplementation(() => {
        throw unknownError;
      });

      // Act & Assert
      expect(() => tokenHelper.verifyToken({ token: mockToken })).toThrow(
        'Token 验证失败: unknown error',
      );
    });
  });

  describe('decodeToken', () => {
    it('应该成功解析 token', () => {
      // Arrange
      jwtService.decode.mockReturnValue(mockJwtPayload);

      // Act
      const result = tokenHelper.decodeToken({ token: mockToken });

      // Assert
      expect(jwtService.decode).toHaveBeenCalledWith(mockToken);
      expect(result).toEqual(mockJwtPayload);
    });

    it('应该在解析失败时返回 null', () => {
      // Arrange
      jwtService.decode.mockImplementation(() => {
        throw new Error('decode failed');
      });

      // Act
      const result = tokenHelper.decodeToken({ token: 'invalid-token' });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('应该正确检测即将过期的 token', () => {
      // Arrange
      const soonExpirePayload = {
        ...mockJwtPayload,
        exp: Math.floor(Date.now() / 1000) + 600, // 10 分钟后过期
      };
      jwtService.decode.mockReturnValue(soonExpirePayload);

      // Act
      const result = tokenHelper.isTokenExpiringSoon({ token: mockToken });

      // Assert
      expect(result).toBe(true);
    });

    it('应该正确检测未即将过期的 token', () => {
      // Arrange
      const notExpirePayload = {
        ...mockJwtPayload,
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 小时后过期
      };
      jwtService.decode.mockReturnValue(notExpirePayload);

      // Act
      const result = tokenHelper.isTokenExpiringSoon({ token: mockToken });

      // Assert
      expect(result).toBe(false);
    });

    it('应该支持自定义过期阈值', () => {
      // Arrange
      const customThresholdPayload = {
        ...mockJwtPayload,
        exp: Math.floor(Date.now() / 1000) + 1800, // 30 分钟后过期
      };
      jwtService.decode.mockReturnValue(customThresholdPayload);

      // Act
      const result = tokenHelper.isTokenExpiringSoon({
        token: mockToken,
        thresholdMinutes: 45, // 45 分钟阈值
      });

      // Assert
      expect(result).toBe(true);
    });

    it('应该在 payload 没有 exp 字段时返回 false', () => {
      // Arrange
      const noExpPayload = {
        ...mockJwtPayload,
        exp: undefined,
      };
      jwtService.decode.mockReturnValue(noExpPayload);

      // Act
      const result = tokenHelper.isTokenExpiringSoon({ token: mockToken });

      // Assert
      expect(result).toBe(false);
    });

    it('判断过期时，在 token 非法时，返回 false', () => {
      // Arrange
      jwtService.decode.mockImplementation(() => {
        throw new Error('decode failed');
      });

      // Act
      const result = tokenHelper.isTokenExpiringSoon({ token: 'invalid-token' });

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('createPayloadFromUser', () => {
    it('应该正确从用户信息创建 payload', () => {
      // Act
      const result = tokenHelper.createPayloadFromUser(mockUser);

      // Assert
      expect(result).toEqual({
        sub: mockUser.id,
        username: mockUser.nickname, // 使用 nickname 作为 username
        email: mockUser.loginEmail,
        accessGroup: mockUser.accessGroup,
      });
    });

    it('应该处理空的 accessGroup', () => {
      // Arrange
      const userWithEmptyGroup = {
        ...mockUser,
        accessGroup: [],
      };

      // Act
      const result = tokenHelper.createPayloadFromUser(userWithEmptyGroup);

      // Assert
      expect(result.accessGroup).toEqual([]);
    });
  });

  describe('validateAudience', () => {
    it('应该验证有效的 audience', () => {
      // Arrange
      const validAudience = 'ssts-test';
      const configAudience = 'ssts-test,sj-test';

      // Act
      const result = tokenHelper.validateAudience(validAudience, configAudience);

      // Assert
      expect(result).toBe(true);
    });

    it('应该验证另一个有效的 audience', () => {
      // Arrange
      const validAudience = 'sj-test';
      const configAudience = 'ssts-test,sj-test';

      // Act
      const result = tokenHelper.validateAudience(validAudience, configAudience);

      // Assert
      expect(result).toBe(true);
    });

    it('应该拒绝无效的 audience', () => {
      // Arrange
      const invalidAudience = 'invalid-client';
      const configAudience = 'ssts-test,sj-test';

      // Act
      const result = tokenHelper.validateAudience(invalidAudience, configAudience);

      // Assert
      expect(result).toBe(false);
    });

    it('应该处理带空格的配置字符串', () => {
      // Arrange
      const validAudience = 'ssts-test';
      const configAudience = ' ssts-test , sj-test ';

      // Act
      const result = tokenHelper.validateAudience(validAudience, configAudience);

      // Assert
      expect(result).toBe(true);
    });

    it('应该在 audience 为空时返回 false', () => {
      // Arrange
      const emptyAudience = '';
      const configAudience = 'ssts-test,sj-test';

      // Act
      const result = tokenHelper.validateAudience(emptyAudience, configAudience);

      // Assert
      expect(result).toBe(false);
    });

    it('应该在 configAudience 为空时返回 false', () => {
      // Arrange
      const validAudience = 'ssts-test';
      const emptyConfig = '';

      // Act
      const result = tokenHelper.validateAudience(validAudience, emptyConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('应该在 audience 为 null 或 undefined 时返回 false', () => {
      // Arrange
      const configAudience = 'ssts-test,sj-test';

      // Act & Assert
      expect(tokenHelper.validateAudience(null as never, configAudience)).toBe(false);
      expect(tokenHelper.validateAudience(undefined as never, configAudience)).toBe(false);
    });

    it('应该在 configAudience 为 null 或 undefined 时返回 false', () => {
      // Arrange
      const validAudience = 'ssts-test';

      // Act & Assert
      expect(tokenHelper.validateAudience(validAudience, null as never)).toBe(false);
      expect(tokenHelper.validateAudience(validAudience, undefined as never)).toBe(false);
    });

    it('应该处理单个 audience 配置', () => {
      // Arrange
      const validAudience = 'ssts-test';
      const singleConfig = 'ssts-test';

      // Act
      const result = tokenHelper.validateAudience(validAudience, singleConfig);

      // Assert
      expect(result).toBe(true);
    });

    it('应该区分大小写', () => {
      // Arrange
      const audienceWithDifferentCase = 'SSTS-TEST';
      const configAudience = 'ssts-test,sj-test';

      // Act
      const result = tokenHelper.validateAudience(audienceWithDifferentCase, configAudience);

      // Assert
      expect(result).toBe(false);
    });
  });
});
