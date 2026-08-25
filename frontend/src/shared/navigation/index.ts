// src/shared/navigation/index.ts

export function sanitizeRedirectTarget(
  candidate: string | null,
  origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
): string {
  if (!candidate || !candidate.startsWith('/')) {
    return '/';
  }

  if (candidate.startsWith('//')) {
    return '/';
  }

  try {
    const parsedURL = new URL(candidate, origin);

    if (parsedURL.origin !== origin) {
      return '/';
    }

    return `${parsedURL.pathname}${parsedURL.search}${parsedURL.hash}`;
  } catch {
    return '/';
  }
}

export function sanitizeInternalPath(path: string) {
  return sanitizeRedirectTarget(path);
}
