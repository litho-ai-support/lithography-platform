// src/adapters/api/rest/reference-document/reference-document-rest.controller.ts

import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { DomainError, REFERENCE_DOCUMENT_ERROR } from '@core/common/errors/domain-error';
import { CreateReferenceDocumentUsecase } from '@src/usecases/reference-document/create-reference-document.usecase';
import { GetReferenceDocumentFileUsecase } from '@src/usecases/reference-document/get-reference-document-file.usecase';
import { REFERENCE_DOCUMENT_STORAGE } from '@src/usecases/reference-document/reference-document-storage.contract';
import { resolveRestStatus } from '@core/common/errors/rest-error-status';
import {
  REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES,
  REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES,
} from '@src/adapters/api/rest/rest-adapter.tokens';
import type {
  ReferenceDocumentFilePayload,
  ReferenceDocumentStorage,
} from '@src/usecases/reference-document/reference-document.types';

/** 上传边界防御性硬上限：multer 先挡住极端超大请求；业务上限以下方配置为准并给出业务错误码 */
const UPLOAD_HARD_LIMIT_BYTES = 64 * 1024 * 1024;

/**
 * 扩展名 → 规范 MIME 映射（单一口径，与 config.module 默认白名单同源维护）。
 * 以扩展名为主判定、以映射结果写入数据库 MIME，不信任客户端 Content-Type
 * （负责人 0909 第二轮：不能直接信任客户端文件名或路径）。
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
};

/** REST 边界的 multipart 文件最小结构（不依赖 multer 类型包，仅取用到的字段） */
type UploadedFilePayload = {
  buffer: Buffer;
  size: number;
  originalname: string;
};

/** 读取 multipart 文本字段：缺省或空白一律视为未提供 */
function readMultipartString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

/**
 * 还原 multer/busboy 对 multipart filename 的 latin1 误码：浏览器发送的 UTF-8 文件名字节
 * 会被逐字节映射为 U+0080..U+00FF（中文文件名在此处已是乱码）。当且仅当全部字符落在
 * latin1 范围时做一次 latin1→UTF-8 还原：纯 ASCII 恒等；已正确解码的高码位字符（含中文）
 * 不受影响。还原结果含 U+FFFD（非 UTF-8 字节）时放弃还原保持原值。
 */
function decodeUtf8FileName(raw: string): string {
  // eslint-disable-next-line no-control-regex -- latin1 范围检测是本函数的既定职责（识别 multer 误码字节），与 sanitizeOriginalFilename 同理
  if (!/^[\u0000-\u00ff]+$/.test(raw)) {
    return raw;
  }
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}

/**
 * 清洗客户端文件名：只取 basename、剔除控制字符与首尾空白；
 * 仅作展示用途存入 original_filename，不参与存储命名与路径组装。
 */
function sanitizeOriginalFilename(raw: string): string {
  const cleaned = path
    .basename(raw)
    // eslint-disable-next-line no-control-regex -- 剔除控制字符是本函数的既定安全职责（清洗客户端文件名）
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  return cleaned.length > 0 ? cleaned.slice(0, 255) : '未命名文件';
}

function toUploadedFilePayload(file: unknown): UploadedFilePayload {
  if (
    typeof file !== 'object' ||
    file === null ||
    !Buffer.isBuffer((file as { buffer?: unknown }).buffer) ||
    typeof (file as { originalname?: unknown }).originalname !== 'string'
  ) {
    throw new DomainError(REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_MISSING, '上传文件缺失或格式不合法');
  }

  return file as UploadedFilePayload;
}

/**
 * 参考资料文件上传 / 下载 REST 边界（负责人 0909 第二轮阻塞项 1）。
 *
 * - 上传：仅 SUPER_ADMIN；multipart/form-data 经存储契约先写文件、再事务落库，
 *   落库失败删除已写文件（原子性：不留 DB 记录与孤儿文件的对偶失败）；
 * - 下载：所有已登录角色；按 DB 存储引用经存储契约读取（不接受客户端路径），
 *   StreamableFile 流式返回，Content-Disposition 按 RFC 5987 编码原始文件名；
 * - 错误统一为 HTTP 状态码 + { statusCode, code, message } JSON 体，不携带服务器路径。
 */
@Controller('api/reference-documents')
export class ReferenceDocumentRestController {
  private readonly uploadMaxBytes: number;
  private readonly allowedMimeTypes: ReadonlySet<string>;

  constructor(
    private readonly createReferenceDocumentUsecase: CreateReferenceDocumentUsecase,
    private readonly getReferenceDocumentFileUsecase: GetReferenceDocumentFileUsecase,
    @Inject(REFERENCE_DOCUMENT_STORAGE)
    private readonly storage: ReferenceDocumentStorage,
    @Inject(REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES)
    uploadMaxBytes: number,
    @Inject(REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES)
    allowedMimeTypes: string[],
  ) {
    // 上传上限与 MIME 白名单由 rest-adapter.module DI 装配读取（运行时配置不入 controller）
    this.uploadMaxBytes = uploadMaxBytes;
    this.allowedMimeTypes = new Set(allowedMimeTypes);
  }

  /** 文件上传创建（仅 SUPER_ADMIN）：multipart/form-data；contentText 可空，与文件双空才拒绝 */
  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES } }))
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @UploadedFile() file: unknown,
    @Body() body: Record<string, unknown>,
    @currentUser() user: JwtPayload,
  ): Promise<{ id: number }> {
    const uploaded = toUploadedFilePayload(file);

    if (uploaded.size > this.uploadMaxBytes) {
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TOO_LARGE, '上传文件超过大小限制');
    }

    // 类型以扩展名为主判定（不信任客户端 MIME 头），MIME 白名单来自配置
    const originalFilename = sanitizeOriginalFilename(decodeUtf8FileName(uploaded.originalname));
    const extension = path.extname(originalFilename).slice(1).toLowerCase();
    const mimeType = EXTENSION_TO_MIME[extension];

    if (mimeType === undefined || !this.allowedMimeTypes.has(mimeType)) {
      throw new DomainError(
        REFERENCE_DOCUMENT_ERROR.UPLOAD_FILE_TYPE_NOT_ALLOWED,
        '不允许上传该类型的文件',
      );
    }

    // 先写存储文件，再事务落库；落库失败删除已写文件（不留孤儿文件）
    let storageReference: string;

    try {
      storageReference = await this.storage.save(uploaded.buffer, extension);
    } catch {
      throw new DomainError(REFERENCE_DOCUMENT_ERROR.CREATION_FAILED, '文件保存失败，请稍后重试');
    }

    try {
      const contentText = readMultipartString(body, 'contentText');
      const equipmentModelIdRaw = readMultipartString(body, 'equipmentModelId');
      const result = await this.createReferenceDocumentUsecase.execute({
        session: mapJwtToUsecaseSession(user),
        title: readMultipartString(body, 'title') ?? '',
        documentType: readMultipartString(body, 'documentType') ?? '',
        equipmentModelId: equipmentModelIdRaw === null ? null : Number(equipmentModelIdRaw),
        description: readMultipartString(body, 'description'),
        contentText,
        file: { originalFilename, mimeType, storageReference },
      });

      return { id: result.id };
    } catch (error) {
      await this.storage.delete(storageReference).catch(() => undefined);

      if (error instanceof DomainError) {
        this.toRestError(error);
      }

      throw error;
    }
  }

  /** 文件下载（ENGINEER + SUPER_ADMIN，与 GraphQL 读口径一致——客户无页面访问权限不开放下载；软删/不存在/文件缺失统一受控错误，不泄露路径） */
  @Get(':id/download')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN, IdentityTypeEnum.ENGINEER)
  async download(
    @Param('id', ParseIntPipe) id: number,
    @currentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    let payload: ReferenceDocumentFilePayload;

    try {
      payload = await this.getReferenceDocumentFileUsecase.execute({
        session: mapJwtToUsecaseSession(user),
        documentId: id,
      });
    } catch (error) {
      if (error instanceof DomainError) {
        this.toRestError(error);
      }

      throw error;
    }

    // MIME 取自 DB（上传时由扩展名映射写入），文件名按 RFC 5987 编码防乱码与头注入；
    // encodeURIComponent 不转义 ' * ( )，它们均不在 RFC 5987 attr-char 内（' 还是 ext-value 分隔符），需补编码
    const encodedFilename = encodeURIComponent(payload.originalFilename).replace(
      /['*()]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    response.setHeader('Content-Type', payload.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);

    return new StreamableFile(createReadStream(payload.absolutePath));
  }

  /** DomainError → REST 统一错误体；函数签名返回 never，便于在 catch 中直接调用后 throw */
  private toRestError(error: DomainError): never {
    const status = resolveRestStatus(error.code);

    throw new HttpException(
      { statusCode: status, code: error.code, message: error.message },
      status,
    );
  }
}
