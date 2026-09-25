import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/data";
import { getViewer } from "@/lib/viewer";
import { getClinicRoles } from "@/lib/roles";
import { signedAvatarUrls } from "@/lib/avatars";
import { PermissionSummary } from "@/components/PermissionSummary";
import { Badge, Card } from "@/components/ui";
import { ProfileClient } from "./ProfileClient";
import { getT } from "@/i18n/server";

/** My profile: every member, from the avatar menu. In support mode it shows the member being
 * viewed as, read-only. */
export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const t = await getT();
  const supabase = await createClient();

  const [profile, roles] = await Promise.all([getMyProfile(supabase, viewer.userId), getClinicRoles(supabase, viewer.clinicId)]);
  if (!profile) redirect("/");
  // support signs in as itself; the viewed-as member's own email comes from the auth service
  const email = viewer.support
    ? ((await createAdminClient().auth.admin.getUserById(viewer.userId)).data.user?.email ?? "")
    : viewer.email;
  const avatarUrl = (await signedAvatarUrls(supabase, [profile])).get(profile.id) ?? null;
  const roleName = (key: string) => t(roles.find((r) => r.key === key)?.name ?? "Custom role");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("My profile")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("How you appear to your clinic, and how you sign in. Display preferences are under My settings.")}
        </p>
      </div>

      <ProfileClient
        email={email}
        displayName={profile.display_name ?? ""}
        phone={profile.phone}
        avatarUrl={avatarUrl}
        readOnly={!!viewer.support}
      />

      <Card className="p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">{t("My roles")}</h2>
        <div className="mb-4 mt-2 flex flex-wrap gap-1.5">
          {viewer.roles.length > 0 ? (
            viewer.roles.map((key) => (
              <Badge key={key} tone={key === "admin" ? "blue" : "slate"}>
                {roleName(key)}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-slate-500">{t("You have no roles in this clinic.")}</span>
          )}
        </div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("What I can do")}</h3>
        <p className="mb-4 text-sm text-slate-500">{t("Ask an admin if you need something that isn't here.")}</p>
        <PermissionSummary permissions={viewer.permissions} modules={viewer.modules} />
      </Card>
    </div>
  );
}
