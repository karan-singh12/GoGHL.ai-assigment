// UI text for server error codes (server/src/constants/messages.ts). Falls back
// to the server's own message, then to a generic line.

const BY_CODE: Record<string, string> = {
  NETWORK_ERROR: 'You appear to be offline. We will keep trying.',
  UNAUTHENTICATED: 'Your session has ended. Please sign in again.',
  FORBIDDEN_WORKSPACE: 'You do not have access to this workspace.',
  FORBIDDEN_ROLE: 'Your role does not allow this action.',
  CONVERSATION_TAKEN: 'Another agent claimed this conversation first.',
  CONVERSATION_NOT_FOUND: 'This conversation no longer exists.',
  VALIDATION_FAILED: 'Please check what you entered.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  LOGIN_STATE_INVALID: 'That sign-in link expired. Please try again.',
  LOGIN_DENIED: 'Sign-in was cancelled.',
  LOGIN_FAILED: 'We could not verify your sign-in. Please try again.',
  IDP_UNAVAILABLE: 'The sign-in service is not reachable right now.',
};

export function messageFor(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string };
    if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
    if (e.message) return e.message;
  }
  return 'Something went wrong.';
}

export const UI = {
  appName: 'Switchboard',
  signInTitle: 'Sign in to your team inbox',
  signInButton: 'Sign in',
  accountsNote: 'Accounts and workspace roles are managed by your identity provider. There is no sign-up here: ask your workspace admin for access.',
  redirecting: 'Redirecting to sign-in…',
  signOut: 'Sign out',
  emptyInbox: 'No conversations here yet.',
  pickConversation: 'Select a conversation to start.',
  emptyThread: 'No messages yet. Say hello.',
  composerPlaceholder: 'Write a reply… (Enter to send, Shift+Enter for a new line)',
  notSent: 'Not sent',
  retry: 'Retry',
  loadOlder: 'Load older messages',
  loadMore: 'Load more',
  noAccess: 'You are not a member of this workspace.',
};
