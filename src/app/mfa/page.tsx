import { redirect } from "next/navigation";
import { getSuperadminForMfa } from "@/lib/platform";
import { MfaClient } from "./MfaClient";

/** Second sign-in step for superadmins (only they need it for now). Lives outside /platform
 * so its layout's check — which sends unverified sessions here — can't loop. */
export default async function MfaPage() {
  const { user, mfa } = await getSuperadminForMfa();
  if (mfa === "verified") redirect("/platform");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="DentalSeller" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-xl font-semibold text-slate-900">
            {mfa === "needs_setup" ? "Set up two-factor sign-in" : "Two-factor sign-in"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mfa === "needs_setup"
              ? "Required for the platform area. You'll need an authenticator app such as Google Authenticator or Authy."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <MfaClient mode={mfa === "needs_setup" ? "setup" : "verify"} email={user.email ?? ""} />
        </div>
      </div>
    </div>
  );
}
