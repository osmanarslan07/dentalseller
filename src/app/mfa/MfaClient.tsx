"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/lib/auth-actions";
import { Button, Input, Label } from "@/components/ui";

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Talks to Supabase Auth's MFA API from the browser, which upgrades the session cookie to
 * aal2 on success — the server-side checks then let the platform area through. */
export function MfaClient({ mode, email }: { mode: "setup" | "verify"; email: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Enrolling is a server-side write, so it must happen exactly once per page: React's dev
  // Strict Mode runs effects twice, and two concurrent enrolls for one user make Supabase
  // return a 500 ("Unexpected failure"). The ref survives that double run.
  const enrollStarted = useRef(false);

  useEffect(() => {
    if (mode !== "setup" || enrollStarted.current) return;
    enrollStarted.current = true;
    (async () => {
      const supabase = createClient();
      // A reload mid-setup leaves an unverified factor behind; clear it first.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        // unique per enrollment — Supabase requires distinct names per user
        friendlyName: `DentalSeller platform (${email}) ${new Date().toISOString().slice(0, 16)}`,
      });
      if (error) setError(error.message);
      else setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [mode, email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      let factorId = enrollment?.factorId;
      if (!factorId) {
        const { data } = await supabase.auth.mfa.listFactors();
        factorId = data?.totp.find((f) => f.status === "verified")?.id;
      }
      if (!factorId) throw new Error("No authenticator found. Reload the page to set one up.");

      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) throw new Error(/invalid/i.test(error.message) ? "That code didn't match. Try the current one." : error.message);

      // the browser client has already written the upgraded (aal2) session cookie
      router.replace("/platform");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {mode === "setup" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">1. Scan this code with your authenticator app.</p>
          <div className="flex justify-center rounded-lg bg-slate-50 p-3">
            {enrollment ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enrollment.qrCode} alt="Authenticator QR code" className="h-44 w-44" />
            ) : (
              <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-400">
                {error ? "Couldn't start setup" : "Preparing…"}
              </div>
            )}
          </div>
          {enrollment && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Can&apos;t scan? Enter the key manually</summary>
              <code className="mt-2 block break-all rounded bg-slate-50 px-2 py-1.5 font-mono text-slate-700">
                {enrollment.secret}
              </code>
            </details>
          )}
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Keep a backup: scan the same code on a second device, or save the key in your password manager. Losing
            every copy locks you out of the platform area until the factor is removed from the Supabase dashboard.
          </p>
          <p className="text-sm text-slate-600">2. Enter the 6-digit code it shows.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Authenticator code</Label>
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending || code.length !== 6 || (mode === "setup" && !enrollment)}>
          {pending ? "Verifying…" : mode === "setup" ? "Turn on two-factor sign-in" : "Verify"}
        </Button>
      </form>

      <form action={logout} className="text-center">
        <button type="submit" className="text-xs text-slate-500 hover:text-slate-700">
          Sign out
        </button>
      </form>
    </div>
  );
}
