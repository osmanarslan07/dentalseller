import { cookies } from "next/headers";
import { requireSuperadmin } from "@/lib/platform";
import { PlatformShell } from "@/components/PlatformNav";
import { ToastProvider } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { PIN_COOKIE } from "@/lib/nav-pin";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, displayName } = await requireSuperadmin();
  const menuPinned = (await cookies()).get(`${PIN_COOKIE}_${user.id}`)?.value === "1";

  return (
    <div className="min-h-screen">
      <PresenceHeartbeat />
      <ToastProvider>
        <PlatformShell email={user.email ?? ""} displayName={displayName} userId={user.id} initialPinned={menuPinned}>
          <main className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </PlatformShell>
      </ToastProvider>
    </div>
  );
}
