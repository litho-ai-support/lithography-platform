import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export function isStringRecord(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'isStringRecord',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null) {
            return true;
          }
          if (typeof value !== 'object' || Array.isArray(value)) {
            return false;
          }
          return Object.values(value as Readonly<Record<string, unknown>>).every(
            (item) => typeof item === 'string',
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a string record`;
        },
      },
    });
  };
}
