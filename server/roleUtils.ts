import type { User } from "@shared/schema";

export function isAdmin(user: User | undefined): boolean {
  return user?.role === 'admin';
}

export function isManager(user: User | undefined): boolean {
  return user?.role === 'manager';
}

export function isAdminOrManager(user: User | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'manager';
}

export function canViewFinancialData(user: User | undefined): boolean {
  return user?.role === 'admin';
}
