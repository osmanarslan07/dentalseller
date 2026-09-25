import { SupabaseClient } from "@supabase/supabase-js";

export const AVATAR_BUCKET = "avatars";
/** Photos are shrunk in the browser before upload; this is only the guard against a raw file. */
export const AVATAR_MAX_BYTES = 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A person's photo always lives at this one path — the storage policies only accept it,
 * so nobody can point a profile at someone else's file. */
export function avatarPath(clinicId: string, userId: string): string {
  return `${clinicId}/${userId}`;
}

/** Short-lived links to the photos of these people (only those who have one). Signed with
 * the caller's own client, so the storage policies decide what they may see. */
export async function signedAvatarUrls(
  supabase: SupabaseClient,
  people: { id: string; clinic_id: string | null; avatar_updated_at?: string | null }[]
): Promise<Map<string, string>> {
  const withPhoto = people.filter((p) => p.clinic_id && p.avatar_updated_at);
  if (withPhoto.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(
      withPhoto.map((p) => avatarPath(p.clinic_id!, p.id)),
      60 * 60
    );
  if (error) {
    console.error("Avatar links failed:", error.message);
    return new Map();
  }
  const urls = new Map<string, string>();
  (data ?? []).forEach((d, i) => {
    if (d.signedUrl) urls.set(withPhoto[i].id, d.signedUrl);
  });
  return urls;
}
