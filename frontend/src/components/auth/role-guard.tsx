"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import type { PermissionName, RoleName } from "@/lib/types";

interface RoleGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  anyRole?: RoleName[];
  everyPermission?: PermissionName[];
}

export function RoleGuard({ children, fallback = null, anyRole = [], everyPermission = [] }: RoleGuardProps) {
  const { hasPermission, hasRole, isRbacSession } = useAuth();

  if (!isRbacSession) {
    return fallback;
  }

  if (anyRole.length > 0 && !hasRole(...anyRole)) {
    return fallback;
  }

  if (everyPermission.length > 0 && !hasPermission(...everyPermission)) {
    return fallback;
  }

  return <>{children}</>;
}
