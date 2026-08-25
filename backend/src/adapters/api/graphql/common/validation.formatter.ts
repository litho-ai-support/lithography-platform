// src/adapters/api/graphql/common/validation.formatter.ts
import { ValidationError } from 'class-validator';

export function formatValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];

  errors.forEach((error) => {
    if (error.constraints) {
      Object.values(error.constraints).forEach((message) => {
        messages.push(message);
      });
    }

    if (error.children && error.children.length > 0) {
      const childMessages = formatValidationErrors(error.children);
      messages.push(childMessages);
    }
  });

  return messages.join('; ');
}
