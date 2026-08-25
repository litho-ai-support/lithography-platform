// src/features/local-assistant/index.ts

import type {
  AssistantReply,
  AssistantRouteCandidate,
  AssistantRouteSuggestion,
} from '@/entities/assistant-session';

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function scoreCandidate(query: string, candidate: AssistantRouteCandidate) {
  const searchableText = normalizeText(
    [candidate.label, candidate.description, ...candidate.tags].join(' '),
  );

  if (!query) {
    return 0;
  }

  return query
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .reduce((score, token) => (searchableText.includes(token) ? score + 1 : score), 0);
}

function toSuggestion(candidate: AssistantRouteCandidate): AssistantRouteSuggestion {
  return {
    description: candidate.description,
    id: candidate.id,
    label: candidate.label,
    path: candidate.path,
  };
}

export function resolveLocalAssistantQuery(
  input: string,
  candidates: readonly AssistantRouteCandidate[],
): AssistantReply {
  const query = normalizeText(input);
  const rankedCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(query, candidate),
    }))
    .sort((left, right) => right.score - left.score);
  const matchedSuggestions = rankedCandidates
    .filter((item) => item.score > 0)
    .slice(0, 3)
    .map((item) => toSuggestion(item.candidate));

  if (matchedSuggestions.length > 0) {
    return {
      content: '我找到了最接近这个意图的本地页面。',
      suggestions: matchedSuggestions,
    };
  }

  return {
    content: '还没有精确匹配的本地页面，可以先回到工作台继续定位。',
    suggestions: rankedCandidates.slice(0, 2).map((item) => toSuggestion(item.candidate)),
  };
}
