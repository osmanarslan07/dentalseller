"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { CURRENCY_NAMES, SUPPORTED_CURRENCIES } from "@/lib/money";
import { createClinic, CreateClinicResult } from "../../actions";
import { CredentialNotice } from "@/components/CredentialNotice";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewClinicForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateClinicResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      setResult(await createClinic(new FormData(e.currentTarget)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create clinic");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <Card className="space-y-4 p-6">
        <CredentialNotice title="Clinic created. First admin account:" email={result.email} tempPassword={result.tempPassword} />
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/platform/clinics/${result.clinicId}`}
            className="inline-flex items-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Open clinic
          </Link>
          <Link
            href="/platform"
            className="inline-flex items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Back to overview
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-semibold text-slate-900">Clinic</legend>
          <div>
            <Label>Name</Label>
            <Input
              name="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              placeholder="Smile Dental Istanbul"
            />
          </div>
          <div>
            <Label>Slug</Label>
            <Input
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
              placeholder="smile-istanbul"
            />
            <p className="mt-1 text-xs text-slate-400">Short unique ID, lowercase letters, numbers and dashes.</p>
          </div>
          <div>
            <Label>Main currency</Label>
            <Select name="main_currency" defaultValue="GBP">
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_NAMES[c]}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              What the clinic reports in (commission, totals). The clinic can add other currencies itself; this one is
              fixed once it has patients.
            </p>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-slate-100 pt-5">
          <legend className="mb-1 text-sm font-semibold text-slate-900">First admin</legend>
          <div>
            <Label>Name</Label>
            <Input name="admin_name" required placeholder="Ayşe Yılmaz" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="admin_email" type="email" required placeholder="admin@clinic.com" />
          </div>
        </fieldset>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Link
            href="/platform"
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create clinic"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
