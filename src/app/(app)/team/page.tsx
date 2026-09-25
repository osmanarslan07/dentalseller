import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";

/** The old Team page split in two: Sales performance and Activity. Old links land on
 * whichever of them the viewer may open. */
export default async function TeamRedirect({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [viewer, { month }] = await Promise.all([getViewer(), searchParams]);
  if (viewer && can(viewer, "earnings.all")) {
    redirect(month && /^\d{4}-\d{2}$/.test(month) ? `/sales-performance?month=${month}` : "/sales-performance");
  }
  redirect(viewer && can(viewer, "activity.view") ? "/activity" : "/");
}
