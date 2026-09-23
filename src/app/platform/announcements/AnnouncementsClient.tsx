"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Announcement,
  ANNOUNCEMENT_LEVEL_LABELS,
  ANNOUNCEMENT_LEVELS,
  ANNOUNCEMENT_MAX_LENGTH,
  AnnouncementLevel,
  AnnouncementStatus,
} from "@/lib/announcements";
import { formatActivityTime } from "@/lib/activity-log";
import { AnnouncementBar } from "@/components/AnnouncementBanner";
import { Badge, Button, Card, Label, Select, Textarea, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { createAnnouncement, deleteAnnouncement, endAnnouncement } from "../actions";

type Row = Announcement & { status: AnnouncementStatus };

const LEVEL_TONES: Record<AnnouncementLevel, "blue" | "amber" | "red"> = { info: "blue", warning: "amber", critical: "red" };

const SECTIONS: { status: AnnouncementStatus; title: string; empty: string }[] = [
  { status: "live", title: "Live now", empty: "Nothing is showing to clinics right now." },
  { status: "scheduled", title: "Scheduled", empty: "Nothing scheduled." },
  { status: "ended", title: "Ended", empty: "Nothing yet." },
];

/** datetime-local gives the superadmin's local wall-clock time; send UTC to the server. */
function localToIso(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw).toISOString() : "";
}

export function AnnouncementsClient({ announcements, clinics }: { announcements: Row[]; clinics: [string, string][] }) {
  const clinicName = new Map(clinics);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <NewAnnouncementForm clinics={clinics} />
      <div className="space-y-6">
        {SECTIONS.map((section) => {
          const rows = announcements.filter((a) => a.status === section.status);
          return (
            <Card key={section.status} className="overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
                <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
                <span className="text-xs text-slate-400">{rows.length}</span>
              </div>
              {rows.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-400">{section.empty}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((a) => (
                    <AnnouncementRow key={a.id} announcement={a} clinicName={clinicName} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AnnouncementRow({ announcement: a, clinicName }: { announcement: Row; clinicName: Map<string, string> }) {
  const [pending, setPending] = useState<"end" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  async function run(kind: "end" | "delete") {
    if (kind === "delete" && !confirm("Delete this announcement? It disappears from the list too.")) return;
    setError(null);
    setPending(kind);
    try {
      if (kind === "end") await endAnnouncement(a.id);
      else await deleteAnnouncement(a.id);
      showToast(kind === "end" ? "Announcement ended" : "Announcement deleted");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  const audience = a.clinicIds
    ? a.clinicIds.map((id) => clinicName.get(id) ?? "Deleted clinic").join(", ")
    : "All clinics";

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={LEVEL_TONES[a.level]}>{ANNOUNCEMENT_LEVEL_LABELS[a.level]}</Badge>
        <span className="text-xs text-slate-500">{audience}</span>
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-900">{a.message}</p>
      <p className="mt-2 text-xs text-slate-400">
        {a.status === "scheduled" ? "Starts" : "Started"} {formatActivityTime(a.startsAt)}
        {a.endsAt ? ` · ${a.status === "ended" ? "ended" : "ends"} ${formatActivityTime(a.endsAt)}` : " · no end time"}
        {a.createdByName && ` · by ${a.createdByName}`}
      </p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        {a.status !== "ended" && (
          <Button type="button" variant="secondary" size="sm" disabled={pending !== null} onClick={() => run("end")}>
            {pending === "end" ? "Ending…" : a.status === "live" ? "End now" : "Cancel"}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={pending !== null} onClick={() => run("delete")}>
          {pending === "delete" ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </li>
  );
}

function NewAnnouncementForm({ clinics }: { clinics: [string, string][] }) {
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<AnnouncementLevel>("info");
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("starts_at", localToIso(formData.get("starts_at_local")));
    formData.set("ends_at", localToIso(formData.get("ends_at_local")));
    setSaving(true);
    try {
      await createAnnouncement(formData);
      showToast("Announcement posted ✓");
      setMessage("");
      setLevel("info");
      setAudience("all");
      setFormKey((k) => k + 1); // resets the uncontrolled fields (dates, clinic checkboxes)
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post announcement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="h-fit p-5">
      <h2 className="text-base font-semibold text-slate-900">New announcement</h2>
      <form key={formKey} onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <Label>Message</Label>
          <Textarea
            name="message"
            rows={3}
            required
            maxLength={ANNOUNCEMENT_MAX_LENGTH}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Scheduled maintenance on Sunday 02:00–03:00 (Turkey time). The app may be unavailable briefly."
          />
          <p className="mt-1 text-right text-xs text-slate-400">
            {message.length}/{ANNOUNCEMENT_MAX_LENGTH}
          </p>
        </div>

        <div>
          <Label>Level</Label>
          <Select name="level" value={level} onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}>
            {ANNOUNCEMENT_LEVELS.map((l) => (
              <option key={l} value={l}>
                {ANNOUNCEMENT_LEVEL_LABELS[l]}
                {l === "critical" ? " (can't be dismissed)" : ""}
              </option>
            ))}
          </Select>
        </div>

        <fieldset>
          <Label>Show to</Label>
          <div className="flex gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                value="all"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
              />
              All clinics
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                value="selected"
                checked={audience === "selected"}
                onChange={() => setAudience("selected")}
              />
              Selected clinics
            </label>
          </div>
          {audience === "selected" && (
            <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {clinics.map(([id, name]) => (
                <label key={id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="clinic_ids" value={id} />
                  {name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Starts</Label>
            <Input name="starts_at_local" type="datetime-local" />
            <p className="mt-1 text-xs text-slate-400">Blank = right away</p>
          </div>
          <div>
            <Label>Ends</Label>
            <Input name="ends_at_local" type="datetime-local" />
            <p className="mt-1 text-xs text-slate-400">Blank = until you end it</p>
          </div>
        </div>

        {message.trim() && (
          <div>
            <Label>Preview</Label>
            <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
              <AnnouncementBar level={level} message={message.trim()} />
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={saving || !message.trim()}>
          {saving ? "Posting…" : "Post announcement"}
        </Button>
      </form>
    </Card>
  );
}
