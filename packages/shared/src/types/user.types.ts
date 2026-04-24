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

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}
