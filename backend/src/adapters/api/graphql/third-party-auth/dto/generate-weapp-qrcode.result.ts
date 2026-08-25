// 文件位置：src/adapters/api/graphql/third-party-auth/dto/generate-weapp-qrcode.result.ts
import { Field, ObjectType } from '@nestjs/graphql';

/**
 * 生成微信小程序二维码结果
 */
@ObjectType({ description: '生成微信小程序二维码的返回结果' })
export class GenerateWeappQrcodeResultDTO {
  @Field({ description: '图片内容类型（例如 image/png）' })
  contentType!: string;

  @Field({ nullable: true, description: '图片 Base64 字符串（当 encodeBase64=true 时返回）' })
  imageBase64?: string;

  @Field({
    nullable: true,
    description: '图片二进制（当 encodeBase64=false 时返回，按 Base64 编码）',
  })
  imageBufferBase64?: string;
}
