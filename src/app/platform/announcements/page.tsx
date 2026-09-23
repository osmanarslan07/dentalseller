import { getAnnouncements, getClinicNames } from "@/lib/platform";
import { announcementStatus } from "@/lib/announcements";
import { AnnouncementsClient } from "./AnnouncementsClient";

export default async function PlatformAnnouncementsPage() {
  const [all, clinics] = await Promise.all([getAnnouncements(), getClinicNames()]);
  // Status is decided here, once per request — the client shouldn't read the clock mid-render.
  const announcements = all.map((a) => ({ ...a, status: announcementStatus(a) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Announcements</h1>
        <p className="mt-1 text-sm text-slate-500">
          A banner at the top of the app for every clinic, or just the ones you pick. Critical banners can&apos;t be
          dismissed.
        </p>
      </div>
      <AnnouncementsClient announcements={announcements} clinics={clinics} />
    </div>
  );
}
