export type UserRole = 'Admin' | 'Lawyer' | 'Client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: 'free' | 'pro';
  docCount: number;
  googleId?: string;
  barCouncilState?: string;
  enrollmentNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Body accepted by POST /auth/register. There is deliberately no `role`:
 * self-registration always creates a 'Client' (T-196). A `role` key sent by
 * the client is stripped by the validator and never reaches the service.
 */
export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  referralCode?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
