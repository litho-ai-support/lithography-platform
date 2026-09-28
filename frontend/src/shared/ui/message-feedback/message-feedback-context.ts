// src/shared/ui/message-feedback/message-feedback-context.ts

import { createContext } from 'react';
import { message } from 'antd';

export type MessageInstance = ReturnType<typeof message.useMessage>[0];

export const MessageFeedbackContext = createContext<MessageInstance | null>(null);
