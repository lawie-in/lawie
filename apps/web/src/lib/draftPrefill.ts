/**
 * T-521/T-565 item 40: the sessionStorage key for the matter text the dashboard command bar
 * leaves for the describe step. One definition, shared by the writer
 * (components/dashboard/DashboardCommandBar.tsx), the reader (components/intake/initialQuery.ts)
 * and the session code (lib/auth.ts), which removes it on sign-out and when a new session starts.
 * No imports, so lib/auth.ts can use it without pulling in components.
 */
export const DRAFT_PREFILL_KEY = 'lawie:draft-prefill';
