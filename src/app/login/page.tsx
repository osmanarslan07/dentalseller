import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="animate-gradient-pan pointer-events-none absolute inset-0 bg-gradient-to-br from-teal-100/60 via-transparent to-blue-100/60" />
      <div className="animate-float-slow pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
      <div className="animate-float-slow-reverse pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="animate-fade-in-up mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="DentalSeller" className="mx-auto mb-4 h-18 w-18" />
          <h1 className="text-xl font-semibold text-slate-900">DentalSeller</h1>
          <p className="mt-1 text-sm text-slate-500">Antalya treatment patients &amp; commission</p>
          <p className="mt-1 text-xs text-slate-400">Accounts are created by your clinic admin.</p>
        </div>

        <div
          className="animate-fade-in-up rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
          style={{ animationDelay: "80ms" }}
        >
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
