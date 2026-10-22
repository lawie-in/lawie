import { meetsPasswordRule } from '../constants/password';

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(password: string): boolean {
  // T-522: the shared rule in constants/password.ts (min 8, upper, lower, digit).
  return meetsPasswordRule(password);
}

export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}
