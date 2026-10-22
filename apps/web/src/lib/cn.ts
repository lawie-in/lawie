import { clsx, type ClassValue } from 'clsx';

/**
 * T-511: join class names. Plain clsx on purpose: tailwind-merge does not know the `nl-*`
 * type classes and could drop one it thinks conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
