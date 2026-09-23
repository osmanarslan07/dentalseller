import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile, getSettings } from "@/lib/data";
import { getTryRate } from "@/lib/currency";
import { Nav } from "@/components/Nav";
import { PrivacyProvider } from "@/components/privacy";
import { CelebrationSoundProvider } from "@/components/celebration-sound";
import { ToastProvider } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { LiveAnnouncement } from "@/lib/announcements";
import { Button } from "@/components/ui";
import { logout } from "@/lib/auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getMyProfile(supabase, user.id);
  // A superadmin has no clinic, patients or commission — this whole shell is meaningless for them.
  if (profile?.role === "superadmin") redirect("/platform");
  if (!profile?.display_name) redirect("/welcome");

  // RLS already locks a suspended clinic's team out of every shared record (is_active_profile);
  // this just explains why, instead of rendering an app full of empty pages.
  const { data: clinic } = await supabase.from("clinics").select("is_active").eq("id", profile.clinic_id).maybeSingle();
  if (clinic && !clinic.is_active) return <ClinicSuspended />;

  const [settings, announcements] = await Promise.all([getSettings(supabase, user.id), getLiveAnnouncements(supabase)]);
  const tryRate =
    settings.show_try && settings.currency !== "TRY" ? await getTryRate(settings.currency) : null;

  return (
    <div className="min-h-screen">
      <PresenceHeartbeat />
      <ToastProvider>
        <PrivacyProvider initialHidden={settings.hide_earnings} showTry={settings.show_try} tryRate={tryRate}>
          <CelebrationSoundProvider initialEnabled={settings.celebration_sound}>
            <AnnouncementBanner announcements={announcements} />
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

/** RLS returns only what is live now and aimed at this clinic. Best-effort: a banner is
 * never worth breaking the app over. */
async function getLiveAnnouncements(supabase: Awaited<ReturnType<typeof createClient>>): Promise<LiveAnnouncement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, message, level")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Announcements fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as LiveAnnouncement[];
}

function ClinicSuspended() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-900/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="DentalSeller" className="mx-auto mb-4 h-14 w-14" />
        <h1 className="text-lg font-semibold text-slate-900">This clinic&apos;s account is suspended</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your data is safe, but access is paused. Contact DentalSeller support to reactivate it.
        </p>
        <form action={logout} className="mt-5">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
