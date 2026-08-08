import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { getTryRate } from "@/lib/currency";
import { Nav } from "@/components/Nav";
import { PrivacyProvider } from "@/components/privacy";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const settings = await getSettings(supabase);
  const tryRate =
    settings.show_try && settings.currency !== "TRY" ? await getTryRate(settings.currency) : null;

  return (
    <div className="min-h-screen">
      <PrivacyProvider initialHidden={settings.hide_earnings} showTry={settings.show_try} tryRate={tryRate}>
        <Nav email={user.email ?? ""} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </PrivacyProvider>
    </div>
  );
}
