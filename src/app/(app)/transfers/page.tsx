import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getTransferCompanies, getTransfersInRange } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { TransfersClient } from "./TransfersClient";
import { can, requirePagePermission } from "@/lib/permissions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "Today" where the clinics are — the server runs in UTC, which is still yesterday for
 * Antalya's first three hours. */
function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; days?: string }>;
}) {
  await requirePagePermission("transfers.manage");
  const params = await searchParams;
  const today = istanbulToday();
  const from = params.date && ISO_DATE.test(params.date) ? params.date : today;
  const days = [1, 2, 7].includes(Number(params.days)) ? Number(params.days) : 2;
  const to = addDays(from, days - 1);

  const supabase = await createClient();
  const [transfers, companies, clinicConfig, viewer] = await Promise.all([
    getTransfersInRange(supabase, from, to),
    getTransferCompanies(supabase),
    getClinicConfig(supabase),
    getViewer(),
  ]);

  return (
    <TransfersClient
      transfers={transfers}
      companies={companies}
      driverMessages={clinicConfig.driverMessages.mode}
      isAdmin={can(viewer, "drivers.manage")}
      from={from}
      days={days}
      today={today}
      dates={Array.from({ length: days }, (_, i) => addDays(from, i))}
      prevDate={addDays(from, -days)}
      nextDate={addDays(from, days)}
    />
  );
}
