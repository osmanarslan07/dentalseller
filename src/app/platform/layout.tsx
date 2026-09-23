import { requireSuperadmin } from "@/lib/platform";
import { PlatformNav } from "@/components/PlatformNav";
import { ToastProvider } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, displayName } = await requireSuperadmin();

  return (
    <div className="min-h-screen">
      <PresenceHeartbeat />
      <ToastProvider>
        <PlatformNav email={user.email ?? ""} displayName={displayName} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </ToastProvider>
    </div>
  );
}
