"use client";

import { createContext, ReactNode, useContext } from "react";
import { ClinicModule, Permission } from "@/types";

const PermissionsContext = createContext<Permission[]>([]);
const ModulesContext = createContext<ClinicModule[]>([]);

/** The viewer's permissions for every client component under the app shell — set once by the
 * layout from the database's answer. Hiding a button is only a courtesy: RLS and the server
 * actions enforce the same list. */
export function PermissionsProvider({
  permissions,
  modules,
  children,
}: {
  permissions: Permission[];
  modules: ClinicModule[];
  children: ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={permissions}>
      <ModulesContext.Provider value={modules}>{children}</ModulesContext.Provider>
    </PermissionsContext.Provider>
  );
}

export function useCan(perm: Permission): boolean {
  return useContext(PermissionsContext).includes(perm);
}

export function usePermissions(): Permission[] {
  return useContext(PermissionsContext);
}

/** Whether the clinic has this part of the product switched on. */
export function useModule(module: ClinicModule): boolean {
  return useContext(ModulesContext).includes(module);
}
