"use client";

import { FormEvent, useState, useTransition } from "react";
import { Profile } from "@/types";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { addSeller, AddSellerResult } from "./team-actions";

export function TeamCard({ profiles, currentUserId }: { profiles: Profile[]; currentUserId: string }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddSellerResult | null>(null);
  const { showToast } = useToast();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await addSeller(email);
        setResult(r);
        setEmail("");
        showToast("Seller added ✓");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add seller");
      }
    });
  }

  function copyPassword() {
    if (!result) return;
    navigator.clipboard.writeText(result.tempPassword).then(() => showToast("Password copied"));
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Team</h2>
      <p className="mb-5 text-sm text-slate-500">
        Sellers can see each other&apos;s patients and calendar, but never each other&apos;s commission.
      </p>

      <ul className="mb-5 divide-y divide-slate-100">
        {profiles.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
            <span className="font-medium text-slate-900">
              {p.display_name || "Invited — awaiting first login"}
              {p.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
            </span>
            <div className="flex items-center gap-1.5">
              {p.role === "admin" && <Badge tone="blue">Admin</Badge>}
              {!p.is_active && <Badge tone="amber">Inactive</Badge>}
              {!p.display_name && <Badge tone="slate">Pending</Badge>}
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Add a seller by email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seller@example.com"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add seller"}
        </Button>
      </form>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Account created for {result.email}</p>
          <p className="mt-1">
            Temporary password:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono">{result.tempPassword}</code>
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            Share this with them directly, not by email — they&apos;ll pick their own name on first
            login. This password is shown once and isn&apos;t saved anywhere.
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={copyPassword}>
            Copy password
          </Button>
        </div>
      )}
    </Card>
  );
}
