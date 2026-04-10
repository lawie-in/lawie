export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(password: string): boolean {
  // Min 8 chars, at least one uppercase, one lowercase, one digit
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}
