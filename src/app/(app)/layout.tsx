import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile, getSettings } from "@/lib/data";
import { getTryRate } from "@/lib/currency";
import { Nav } from "@/components/Nav";
import { PrivacyProvider } from "@/components/privacy";
import { CelebrationSoundProvider } from "@/components/celebration-sound";
import { ToastProvider } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getMyProfile(supabase, user.id);
  if (!profile?.display_name) redirect("/welcome");

  const settings = await getSettings(supabase, user.id);
  const tryRate =
    settings.show_try && settings.currency !== "TRY" ? await getTryRate(settings.currency) : null;

  return (
    <div className="min-h-screen">
      <ToastProvider>
        <PrivacyProvider initialHidden={settings.hide_earnings} showTry={settings.show_try} tryRate={tryRate}>
          <CelebrationSoundProvider initialEnabled={settings.celebration_sound}>
            <Nav email={user.email ?? ""} displayName={profile.display_name} isAdmin={profile.role === "admin"} />
            <main className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
              <PageTransition>{children}</PageTransition>
            </main>
          </CelebrationSoundProvider>
        </PrivacyProvider>
      </ToastProvider>
    </div>
  );
}
