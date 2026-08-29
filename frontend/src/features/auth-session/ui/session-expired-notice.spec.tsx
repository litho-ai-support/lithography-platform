// src/features/auth-session/ui/session-expired-notice.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AUTH_SESSION_EXPIRED_NOTICE_MESSAGE,
  SessionExpiredNotice,
} from './session-expired-notice';

describe('SessionExpiredNotice', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the fixed expiry message when the expiry reason applies', () => {
    render(<SessionExpiredNotice visible />);

    expect(screen.getByText(AUTH_SESSION_EXPIRED_NOTICE_MESSAGE)).toBeInTheDocument();
  });

  it('renders nothing when the notice is not applicable', () => {
    const { container } = render(<SessionExpiredNotice visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
