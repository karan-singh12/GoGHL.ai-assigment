// The message catalog: every API outcome has one code, one HTTP status and one
// default message. Controllers and services refer to codes, never to raw
// strings or status numbers.

export const MSG = {
  // ---- success
  OK: { status: 200, message: 'OK.' },
  CREATED: { status: 201, message: 'Created.' },
  ACCEPTED: { status: 202, message: 'Accepted.' },
  CONVERSATIONS_LISTED: { status: 200, message: 'Conversations fetched.' },
  MESSAGES_LISTED: { status: 200, message: 'Messages fetched.' },
  REPLY_QUEUED: { status: 202, message: 'Reply queued for delivery.' },
  CONVERSATION_CLAIMED: { status: 200, message: 'Conversation claimed.' },
  CONVERSATION_RELEASED: { status: 200, message: 'Conversation released.' },
  CONVERSATION_CLOSED: { status: 200, message: 'Conversation closed.' },
  CONVERSATION_REOPENED: { status: 200, message: 'Conversation reopened.' },
  RESET_DONE: { status: 200, message: 'All application data deleted.' },

  // ---- client errors
  VALIDATION_FAILED: { status: 400, message: 'Request is invalid.' },
  UNAUTHENTICATED: { status: 401, message: 'Sign in required.' },
  INVALID_GRADER_TOKEN: { status: 401, message: 'Missing or invalid grader token.' },
  FORBIDDEN_WORKSPACE: { status: 403, message: 'You are not a member of this workspace.' },
  FORBIDDEN_ROLE: { status: 403, message: 'Your role does not allow this action.' },
  ROUTE_NOT_FOUND: { status: 404, message: 'Route not found.' },
  WORKSPACE_NOT_FOUND: { status: 404, message: 'Workspace not found.' },
  CONVERSATION_NOT_FOUND: { status: 404, message: 'Conversation not found.' },
  CONVERSATION_TAKEN: { status: 409, message: 'Another agent already holds this conversation.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body is too large.' },

  // ---- webhook (PIGEON.md: never 5xx for a bad request)
  WEBHOOK_BAD_SIGNATURE: { status: 401, message: 'Invalid signature.' },
  WEBHOOK_STALE: { status: 401, message: 'Timestamp outside the accepted window.' },
  WEBHOOK_BAD_BODY: { status: 400, message: 'Body could not be parsed.' },

  // ---- server
  SERVICE_UNAVAILABLE: { status: 503, message: 'Service is starting or shutting down.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type MsgCode = keyof typeof MSG;
