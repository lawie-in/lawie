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
  /**
   * T-343 — the privacy version the user had accepted when the access token was issued (the
   * `pv` claim). Set by the gateway from the verified token only; any client-sent copy is
   * stripped. Absent when the token carries no `pv`, which counts as not accepted.
   */
  USER_PRIVACY_VERSION: 'x-user-privacy-version',
} as const;
