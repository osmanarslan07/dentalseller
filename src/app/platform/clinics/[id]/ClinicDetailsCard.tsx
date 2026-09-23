"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Clinic } from "@/lib/platform";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { setClinicActive, updateClinic } from "../../actions";

export function ClinicDetailsCard({ clinic }: { clinic: Clinic }) {
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateClinic(clinic.id, new FormData(e.currentTarget));
      showToast("Clinic saved ✓");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save clinic");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    const suspending = clinic.is_active;
    if (
      suspending &&
      !confirm(`Suspend ${clinic.name}? Everyone at this clinic loses access until it's reactivated. No data is deleted.`)
    ) {
      return;
    }
    setError(null);
    setToggling(true);
    try {
      await setClinicActive(clinic.id, !suspending);
      showToast(suspending ? "Clinic suspended" : "Clinic reactivated ✓");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update clinic");
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card className="h-fit p-5">
      <h2 className="text-base font-semibold text-slate-900">Clinic details</h2>
      <form onSubmit={handleSave} className="mt-4 space-y-4">
        <div>
          <Label>Name</Label>
          <Input name="name" required defaultValue={clinic.name} />
        </div>
        <div>
          <Label>Slug</Label>
          <Input name="slug" required defaultValue={clinic.slug ?? ""} />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">{clinic.is_active ? "Suspend clinic" : "Reactivate clinic"}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {clinic.is_active
            ? "Locks every account at this clinic out of the app. Their data stays intact."
            : "Everyone at this clinic is currently locked out. Reactivating restores access immediately."}
        </p>
        <Button
          type="button"
          variant={clinic.is_active ? "danger" : "primary"}
          size="sm"
          className="mt-3"
          disabled={toggling}
          onClick={handleToggleActive}
        >
          {toggling ? "Updating…" : clinic.is_active ? "Suspend" : "Reactivate"}
        </Button>
      </div>
    </Card>
  );
}
