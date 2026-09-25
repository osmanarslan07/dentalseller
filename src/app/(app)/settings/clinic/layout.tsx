import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { SectionNav } from "./SectionNav";
import { visibleClinicSections } from "./sections";

/** Clinic settings: a section list on the left, one page per section. Each section page
 * checks its own permission; this only lists the ones the viewer may open. */
export default async function ClinicSettingsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const sections = viewer ? visibleClinicSections(viewer.permissions) : [];
  if (sections.length === 0) redirect("/");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Clinic settings</h1>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SectionNav sections={sections.map((s) => ({ id: s.id, label: s.label }))} />
        <div className="min-w-0 max-w-2xl flex-1">{children}</div>
      </div>
    </div>
  );
}
