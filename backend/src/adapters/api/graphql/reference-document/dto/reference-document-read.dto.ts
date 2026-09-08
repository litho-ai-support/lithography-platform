// src/adapters/api/graphql/reference-document/dto/reference-document-read.dto.ts
// AI 参考资料读模型 GraphQL 输出对象（0907.docx 任务二）
// 不返回创建人账号 ID、存储后端/存储引用与服务器路径；不返回解析状态（数据库无此模型）

import { Field, Int, ObjectType } from '@nestjs/graphql';
import { paginatedTypeFactory } from '@src/adapters/api/graphql/pagination.type-factory';

/**
 * 参考资料列表项输出对象
 * 不携带 contentText 大字段（仅详情返回）；创建人展示经 creatorNickname
 */
@ObjectType({ description: '参考资料列表项' })
export class ReferenceDocumentListItemDTO {
  @Field(() => Int, { description: '参考资料 ID' })
  id!: number;

  @Field(() => String, { description: '文档标题' })
  title!: string;

  @Field(() => String, { description: '文档类型' })
  documentType!: string;

  @Field(() => Int, { nullable: true, description: '适用设备型号 ID；为空表示通用资料' })
  equipmentModelId?: number | null;

  @Field(() => String, { nullable: true, description: '适用设备型号名称；通用资料为空' })
  equipmentModelName?: string | null;

  @Field(() => String, { nullable: true, description: '文档说明' })
  description?: string | null;

  @Field(() => String, {
    nullable: true,
    description: '原始文件名（有存储引用的资料返回；纯文本资料为空）',
  })
  originalFilename?: string | null;

  @Field(() => String, { description: '创建人当前昵称（缺失时回落「未知用户」）' })
  creatorNickname!: string;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;
}

/**
 * 参考资料详情输出对象（元数据 + 文本内容）
 * 不返回存储引用与服务器本地路径（0907.docx：不能把服务器本地路径返回给浏览器）
 */
@ObjectType({ description: '参考资料详情（元数据与文本内容）' })
export class ReferenceDocumentDetailDTO {
  @Field(() => Int, { description: '参考资料 ID' })
  id!: number;

  @Field(() => String, { description: '文档标题' })
  title!: string;

  @Field(() => String, { description: '文档类型' })
  documentType!: string;

  @Field(() => Int, { nullable: true, description: '适用设备型号 ID；为空表示通用资料' })
  equipmentModelId?: number | null;

  @Field(() => String, { nullable: true, description: '适用设备型号名称；通用资料为空' })
  equipmentModelName?: string | null;

  @Field(() => String, { nullable: true, description: '文档说明' })
  description?: string | null;

  @Field(() => String, {
    nullable: true,
    description: '原始文件名（有存储引用的资料返回；纯文本资料为空）',
  })
  originalFilename?: string | null;

  @Field(() => String, {
    nullable: true,
    description: '文件 MIME 类型（有存储引用的资料返回；纯文本资料为空）',
  })
  mimeType?: string | null;

  @Field(() => String, { nullable: true, description: '文本内容' })
  contentText?: string | null;

  @Field(() => String, { description: '创建人当前昵称（缺失时回落「未知用户」）' })
  creatorNickname!: string;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '最近更新时间' })
  updatedAt!: Date;
}

/**
 * 参考资料列表分页输出（OFFSET：items/total/page/pageSize）
 */
@ObjectType({ description: '参考资料分页结果' })
export class ReferenceDocumentPaginatedDTO extends paginatedTypeFactory(
  ReferenceDocumentListItemDTO,
) {}
