"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { addSuperadmin, CredentialResult } from "../actions";
import { CredentialNotice } from "@/components/CredentialNotice";

export function AddSuperadminForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialResult | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(`Give ${email} full platform access? They'll be able to create and suspend any clinic.`)) return;
    setError(null);
    setCredential(null);
    setPending(true);
    try {
      setCredential(await addSuperadmin(email, name));
      setName("");
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add superadmin");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Add a superadmin</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {credential && (
        <div className="mt-4">
          <CredentialNotice title="Account created for" email={credential.email} tempPassword={credential.tempPassword} />
        </div>
      )}
    </Card>
  );
}
