import { useAuth } from "./useAuth";
import type { User } from "@shared/schema";

export function useRole() {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
  const canViewFinancialData = user?.role === 'admin';

  return {
    user,
    isAdmin,
    isManager,
    isAdminOrManager,
    canViewFinancialData,
    role: user?.role || 'employee',
  };
}
