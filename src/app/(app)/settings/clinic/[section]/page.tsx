import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClinicConfig, getPatients, getProfiles, getTransferCompanies } from "@/lib/data";
import { can, canAny, requirePagePermission } from "@/lib/permissions";
import { getClinicRoles } from "@/lib/roles";
import { getSecretsStatus } from "@/lib/whatsapp";
import { BrandingCard } from "../../BrandingCard";
import { DataExportCard } from "../../DataExportCard";
import { DriverMessagesCard } from "../../DriverMessagesCard";
import { RolesCard } from "../../RolesCard";
import { SystemSettingsCard } from "../../SystemSettingsCard";
import { TelegramGroupCard } from "../../TelegramGroupCard";
import { TransfersCard } from "../../TransfersCard";
import { MOVED_SECTIONS, getClinicSection } from "../sections";
import { ClinicModule } from "@/types";

/** One section of Clinic settings. The section's own permission is checked here (not just
 * in the list), and only the data that section needs is loaded. */
export default async function ClinicSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: sectionId } = await params;
  if (MOVED_SECTIONS[sectionId]) redirect(MOVED_SECTIONS[sectionId]);
  const section = getClinicSection(sectionId);
  if (!section) notFound();
  const viewer = await requirePagePermission(section.needs);
  const supabase = await createClient();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{section.label}</h2>
        <p className="mt-1 text-sm text-slate-500">{section.description}</p>
      </div>

      {section.id === "clinic" && <BrandingCard clinicConfig={await getClinicConfig(supabase)} />}

      {section.id === "roles" && <RolesSection clinicId={viewer.clinicId} modules={viewer.modules} canEdit={can(viewer, "roles.edit")} canDelete={can(viewer, "roles.delete")} />}

      {section.id === "money" && <SystemSettingsCard clinicConfig={await getClinicConfig(supabase)} />}

      {section.id === "operations" && (
        <OperationsSection isAdmin={can(viewer, "drivers.manage")} />
      )}

      {section.id === "messaging" && (
        <MessagingSection
          clinicId={viewer.clinicId}
          canTelegram={can(viewer, "settings.telegram")}
          canDriverMessages={canAny(viewer, ["messaging.manage", "transfers.manage", "drivers.manage"])}
          isAdmin={can(viewer, "messaging.manage")}
        />
      )}

      {section.id === "data" && <DataExportCard patients={await getPatients(supabase)} />}
    </div>
  );
}

async function RolesSection({
  clinicId,
  modules,
  canEdit,
  canDelete,
}: {
  clinicId: string;
  modules: ClinicModule[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const supabase = await createClient();
  const [profiles, roles] = await Promise.all([getProfiles(supabase), getClinicRoles(supabase, clinicId)]);
  const memberCounts: Record<string, number> = {};
  for (const p of profiles) for (const r of p.roles ?? []) memberCounts[r] = (memberCounts[r] ?? 0) + 1;
  return <RolesCard roles={roles} memberCounts={memberCounts} modules={modules} canEdit={canEdit} canDelete={canDelete} />;
}

async function OperationsSection({ isAdmin }: { isAdmin: boolean }) {
  const supabase = await createClient();
  const [companies, clinicConfig] = await Promise.all([getTransferCompanies(supabase), getClinicConfig(supabase)]);
  return <TransfersCard companies={companies} defaults={clinicConfig.transferDefaults} isAdmin={isAdmin} />;
}

async function MessagingSection({
  clinicId,
  canTelegram,
  canDriverMessages,
  isAdmin,
}: {
  clinicId: string;
  canTelegram: boolean;
  canDriverMessages: boolean;
  isAdmin: boolean;
}) {
  const supabase = await createClient();
  const clinicConfig = await getClinicConfig(supabase);
  const whatsappSecrets = isAdmin ? await getSecretsStatus(clinicId) : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/whatsapp/webhook`;
  return (
    <>
      {canTelegram && <TelegramGroupCard groupChatId={clinicConfig.telegramGroupChatId} />}
      {canDriverMessages && (
        <DriverMessagesCard
        config={clinicConfig.driverMessages}
        isAdmin={isAdmin}
        secrets={whatsappSecrets}
        webhookUrl={webhookUrl}
        />
      )}
    </>
  );
}
