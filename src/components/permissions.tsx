"use client";

import { createContext, ReactNode, useContext } from "react";
import { Permission } from "@/types";

const PermissionsContext = createContext<Permission[]>([]);

/** The viewer's permissions for every client component under the app shell — set once by the
 * layout from the database's answer. Hiding a button is only a courtesy: RLS and the server
 * actions enforce the same list. */
export function PermissionsProvider({ permissions, children }: { permissions: Permission[]; children: ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

export function useCan(perm: Permission): boolean {
  return useContext(PermissionsContext).includes(perm);
}

export function usePermissions(): Permission[] {
  return useContext(PermissionsContext);
}
