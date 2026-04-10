export const USER_ROLES = {
  ADMIN: 'Admin',
  LAWYER: 'Lawyer',
  CLIENT: 'Client',
} as const;

export const ROLE_PERMISSIONS = {
  Admin:  ['read:all', 'write:all', 'delete:all', 'manage:users'],
  Lawyer: ['read:cases', 'write:cases', 'read:documents', 'write:documents', 'read:clients'],
  Client: ['read:own_cases', 'read:own_documents'],
} as const;
