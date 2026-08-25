// src/entities/assistant-session/index.ts

export type AssistantMessageRole = 'assistant' | 'user';

export type AssistantMessage = {
  content: string;
  id: string;
  role: AssistantMessageRole;
};

export type AssistantRouteCandidate = {
  description: string;
  id: string;
  label: string;
  path: string;
  tags: readonly string[];
};

export type AssistantRouteSuggestion = {
  description: string;
  id: string;
  label: string;
  path: string;
};

export type AssistantReply = {
  content: string;
  suggestions: AssistantRouteSuggestion[];
};
