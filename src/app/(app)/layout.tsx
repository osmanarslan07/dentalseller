import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { PrivacyProvider, PRIVACY_COOKIE } from "@/components/privacy";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const initialHidden = cookieStore.get(PRIVACY_COOKIE)?.value === "1";

  return (
    <div className="min-h-screen">
      <PrivacyProvider initialHidden={initialHidden}>
        <Nav email={user.email ?? ""} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </PrivacyProvider>
    </div>
  );
}
