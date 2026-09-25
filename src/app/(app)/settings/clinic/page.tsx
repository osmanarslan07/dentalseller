import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { clinicSectionHref, firstClinicSection, visibleClinicSections } from "./sections";

/** /settings/clinic itself is just the way in: the first section the viewer may open. */
export default async function ClinicSettingsIndex() {
  const viewer = await getViewer();
  const permissions = viewer?.permissions ?? [];
  const first = firstClinicSection(permissions) ?? visibleClinicSections(permissions)[0];
  redirect(first ? clinicSectionHref(first.id) : "/");
}
