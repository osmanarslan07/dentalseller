import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Dental Commission Tracker" className="mx-auto mb-4 h-18 w-18" />
          <h1 className="text-xl font-semibold text-slate-900">Dental Commission Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Antalya treatment patients &amp; commission</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
