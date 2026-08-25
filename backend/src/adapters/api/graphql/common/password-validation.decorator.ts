// src/adapters/api/graphql/common/password-validation.decorator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';

@ValidatorConstraint({ name: 'isValidPassword', async: false })
export class IsValidPasswordConstraint implements ValidatorConstraintInterface {
  private readonly passwordPolicyService = new PasswordPolicyService();

  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const result = this.passwordPolicyService.validatePassword(value);
    return result.isValid;
  }

  defaultMessage(args: ValidationArguments): string {
    if (typeof args.value !== 'string') {
      return '密码必须是字符串';
    }

    const result = this.passwordPolicyService.validatePassword(args.value);

    if (!result.isValid) {
      return `密码不符合安全要求: ${result.errors.join(', ')}`;
    }

    return '密码验证失败';
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function IsValidPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidPasswordConstraint,
    });
  };
}
