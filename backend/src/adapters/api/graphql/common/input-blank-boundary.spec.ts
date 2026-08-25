import { QueueAiGenerateInput } from '@src/adapters/api/graphql/ai/dto/queue-ai-generate.input';
import { QueueEmailInput } from '@src/adapters/api/graphql/email/dto/queue-email.input';
import { plainToInstance } from 'class-transformer';

describe('GraphQL input blank boundary', () => {
  it('trims at the protocol boundary without collapsing blank to undefined', () => {
    const email = plainToInstance(QueueEmailInput, {
      to: ' user@example.com ',
      subject: ' subject ',
      text: '   ',
    });
    const ai = plainToInstance(QueueAiGenerateInput, {
      provider: '   ',
      model: ' model ',
      prompt: ' prompt ',
    });

    expect(email).toMatchObject({
      to: 'user@example.com',
      subject: 'subject',
      text: '',
    });
    expect(ai).toMatchObject({ provider: '', model: 'model', prompt: 'prompt' });
  });
});
