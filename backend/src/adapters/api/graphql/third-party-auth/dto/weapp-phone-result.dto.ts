// src/adapters/api/graphql/third-party-auth/dto/weapp-phone-result.dto.ts
import { Field, ObjectType } from '@nestjs/graphql';

/**
 * 微信小程序手机号结果
 */
@ObjectType()
export class WeappPhoneResultDTO {
  @Field({ description: '手机号码' })
  phoneNumber!: string;

  @Field({ description: '不带区号的手机号' })
  purePhoneNumber!: string;

  @Field({ description: '区号' })
  countryCode!: string;
}
