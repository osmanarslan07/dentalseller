import { NewClinicForm } from "./NewClinicForm";

export default function NewClinicPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">New clinic</h1>
        <p className="mt-1 text-sm text-slate-500">
          Creates the clinic and its first admin account. The admin then adds their own sellers and fills in the
          clinic&apos;s letter branding from Settings.
        </p>
      </div>
      <NewClinicForm />
    </div>
  );
}
