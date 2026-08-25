// 文件位置：src/adapters/api/graphql/third-party-auth/dto/generate-weapp-qrcode.input.ts
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 生成微信小程序二维码输入参数
 */
@InputType({ description: '生成微信小程序二维码的输入参数' })
export class GenerateWeappQrcodeInput {
  @Field(() => AudienceTypeEnum, { description: '客户端类型' })
  @IsEnum(AudienceTypeEnum, { message: '客户端类型无效' })
  audience!: AudienceTypeEnum;

  @Field({ description: '场景值（最多 32 个可见字符）' })
  @IsString()
  @MaxLength(32, { message: 'scene 长度不能超过 32' })
  scene!: string;

  @Field({ nullable: true, description: '小程序页面路径（官方要求不带参数）' })
  @IsOptional()
  @IsString()
  page?: string;

  @Field(() => Int, { nullable: true, description: '图片宽度（280–1280）' })
  @IsOptional()
  @IsInt()
  @Min(280)
  @Max(1280)
  width?: number;

  @Field({ nullable: true, description: '是否校验页面路径（默认 true）' })
  @IsOptional()
  @IsBoolean()
  checkPath?: boolean;

  @Field({ nullable: true, description: '小程序版本（develop / trial / release）' })
  @IsOptional()
  @IsString()
  envVersion?: 'develop' | 'trial' | 'release';

  @Field({ nullable: true, description: '是否透明底色' })
  @IsOptional()
  @IsBoolean()
  isHyaline?: boolean;

  @Field({ nullable: true, description: '是否返回 base64（默认 true）' })
  @IsOptional()
  @IsBoolean()
  encodeBase64?: boolean;
}
