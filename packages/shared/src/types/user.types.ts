export type UserRole = 'Admin' | 'Lawyer' | 'Client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
