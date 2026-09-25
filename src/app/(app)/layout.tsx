import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getMyProfile, getNavBadges, getSettings } from "@/lib/data";
import { todayIsoLocal } from "@/lib/balance";
import { cookies } from "next/headers";
import { PIN_COOKIE } from "@/lib/nav-pin";
import { marketRate } from "@/lib/rates";
import { AppShell } from "@/components/Nav";
import { PrivacyProvider } from "@/components/privacy";
import { CurrencyProvider } from "@/components/currency";
import { CelebrationSoundProvider } from "@/components/celebration-sound";
import { ToastProvider } from "@/components/Toast";
import { PageTransition } from "@/components/PageTransition";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { LiveAnnouncement } from "@/lib/announcements";
import { Button } from "@/components/ui";
import { logout } from "@/lib/auth-actions";
import { REQUIRE_TERMS_ACCEPTANCE } from "@/lib/terms";
import { hasAcceptedCurrentTerms } from "@/lib/terms-status";
import { getViewer } from "@/lib/viewer";
import { SupportBar } from "@/components/SupportBar";
import { PermissionsProvider } from "@/components/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedAvatarUrls } from "@/lib/avatars";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const viewer = await getViewer();
  if (!viewer) {
    const profile = await getMyProfile(supabase, user.id);
    // A superadmin only enters a clinic through an open support session (with two-factor
    // done); otherwise this shell is meaningless for them.
    if (profile?.role === "superadmin") redirect("/platform");
    // RLS hides a deactivated member's own row too, so ask the service role why there's none
    if (!profile) {
      const { data: own } = await createAdminClient().from("profiles").select("is_active, clinic_id").eq("id", user.id).maybeSingle();
      if (own?.clinic_id && !own.is_active) return <AccountDeactivated />;
    }
    if (!profile?.display_name) redirect("/welcome");
    return <AccountNotReady />;
  }

  // The member checks below don't apply to support: it can help a clinic that is suspended
  // or hasn't accepted the terms, and it isn't a member with a name to set.
  if (!viewer.support) {
    if (!viewer.displayName) redirect("/welcome");

    // RLS already locks a suspended clinic's team out of every shared record (is_active_profile);
    // this just explains why, instead of rendering an app full of empty pages.
    const { data: clinic } = await supabase.from("clinics").select("is_active").eq("id", viewer.clinicId).maybeSingle();
    if (clinic && !clinic.is_active) return <ClinicSuspended />;

    // The clinic's admin accepts the current terms (incl. the DPA) on the clinic's behalf before
    // using the app; sellers aren't asked.
    if (REQUIRE_TERMS_ACCEPTANCE && viewer.role === "admin" && !(await hasAcceptedCurrentTerms(supabase))) {
      redirect("/terms/accept");
    }
  }

  const [settings, announcements, clinicConfig, badges, cookieStore, avatarUrl] = await Promise.all([
    getSettings(supabase, viewer.userId),
    getLiveAnnouncements(supabase),
    getClinicConfig(supabase),
    getNavBadges(
      supabase,
      { tasks: viewer.permissions.includes("tasks.use"), transfers: viewer.permissions.includes("transfers.manage") },
      todayIsoLocal()
    ),
    cookies(),
    getMyAvatarUrl(supabase, viewer.userId),
  ]);
  const menuPinned = cookieStore.get(`${PIN_COOKIE}_${viewer.authUserId}`)?.value === "1";
  const main = clinicConfig.mainCurrency;
  const approxRate =
    settings.show_try && settings.approx_currency !== main ? await marketRate(main, settings.approx_currency) : null;
  const approx = approxRate ? { from: main, currency: settings.approx_currency, rate: approxRate } : null;

  return (
    <div className="min-h-screen">
      <PresenceHeartbeat />
      <ToastProvider>
        <PermissionsProvider permissions={viewer.permissions} modules={viewer.modules}>
        <CurrencyProvider currencies={{ main, deal: clinicConfig.dealCurrencies }}>
        <PrivacyProvider initialHidden={settings.hide_earnings} approx={approx}>
          <CelebrationSoundProvider initialEnabled={settings.celebration_sound}>
            <AppShell
              email={viewer.email}
              displayName={viewer.displayName ?? ""}
              avatarUrl={avatarUrl}
              permissions={viewer.permissions}
              userId={viewer.authUserId}
              clinicName={clinicConfig.clinicName}
              clinicLogoUrl={clinicConfig.clinicLogoUrl}
              badges={badges}
              initialPinned={menuPinned}
              banners={
                <>
                  {viewer.support && <SupportBar support={viewer.support} viewAsId={viewer.userId} />}
                  <AnnouncementBanner announcements={announcements} />
                </>
              }
            >
              <main className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 md:pb-8 lg:px-8">
                <PageTransition>{children}</PageTransition>
              </main>
            </AppShell>
          </CelebrationSoundProvider>
        </PrivacyProvider>
        </CurrencyProvider>
        </PermissionsProvider>
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

async function getMyAvatarUrl(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id, clinic_id, avatar_updated_at").eq("id", userId).maybeSingle();
  if (!data) return null;
  return (await signedAvatarUrls(supabase, [data])).get(userId) ?? null;
}

/** A member switched off by their admin. Their sign-in is blocked too; this is what an
 * already-open session shows until it runs out. */
function AccountDeactivated() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-900/5">
        <h1 className="text-lg font-semibold text-slate-900">Your account has been deactivated</h1>
        <p className="mt-2 text-sm text-slate-500">Ask your clinic admin if you think this is a mistake.</p>
        <form action={logout} className="mt-5">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

function AccountNotReady() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-900/5">
        <h1 className="text-lg font-semibold text-slate-900">Your account isn&apos;t linked to a clinic yet</h1>
        <p className="mt-2 text-sm text-slate-500">Ask your clinic admin to add you again, or contact DentalSeller support.</p>
        <form action={logout} className="mt-5">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
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
