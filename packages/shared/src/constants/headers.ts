/** Internal headers injected by the API gateway on every proxied request */
export const INTERNAL_HEADERS = {
  /** Shared secret — downstream services validate this to trust the gateway */
  SECRET: 'x-internal-secret',
  /** Forwarded user context from the decoded JWT */
  USER_ID: 'x-user-id',
  USER_EMAIL: 'x-user-email',
  USER_ROLE: 'x-user-role',
  USER_PLAN: 'x-user-plan',
  USER_NAME: 'x-user-name',
} as const;
