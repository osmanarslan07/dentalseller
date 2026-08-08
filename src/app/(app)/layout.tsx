import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { Nav } from "@/components/Nav";
import { PrivacyProvider } from "@/components/privacy";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const settings = await getSettings(supabase);

  return (
    <div className="min-h-screen">
      <PrivacyProvider initialHidden={settings.hide_earnings}>
        <Nav email={user.email ?? ""} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </PrivacyProvider>
    </div>
  );
}
