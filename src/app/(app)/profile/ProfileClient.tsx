"use client";

import { ChangeEvent, FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import {
  changeMyEmail,
  changePassword,
  removeMyAvatar,
  updateDisplayName,
  updateMyPhone,
  uploadMyAvatar,
} from "@/lib/profile-actions";

/** My profile: who I am to the clinic — name, photo, sign-in email, phone, password. In
 * support mode it is shown read-only (the actions refuse support anyway). */
export function ProfileClient({
  email,
  displayName,
  phone,
  avatarUrl,
  readOnly,
}: {
  email: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-6">
      <NameAndPhotoCard displayName={displayName} email={email} avatarUrl={avatarUrl} readOnly={readOnly} />
      <ContactCard email={email} phone={phone} readOnly={readOnly} />
      {!readOnly && <PasswordCard />}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null;
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** A square crop of the picture, 256 px, as WebP (JPEG where the browser can't write WebP):
 * small enough to upload in one go, sharp enough for any avatar size. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn't an image we can read"));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    canvas.getContext("2d")!.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256
    );
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    const webp = await toBlob("image/webp");
    const blob = webp?.type === "image/webp" ? webp : await toBlob("image/jpeg");
    if (!blob) throw new Error("Couldn't prepare that photo");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function NameAndPhotoCard({
  displayName,
  email,
  avatarUrl,
  readOnly,
}: {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  readOnly: boolean;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(displayName);
  const [namePending, startName] = useTransition();
  const [photoPending, startPhoto] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startName(async () => {
      try {
        await updateDisplayName(name);
        showToast("Name updated ✓");
      } catch (err) {
        setError(message(err, "Failed to update name"));
      }
    });
  }

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    startPhoto(async () => {
      try {
        const blob = await shrinkPhoto(file);
        const fd = new FormData();
        fd.set("photo", new File([blob], "photo", { type: blob.type }));
        await uploadMyAvatar(fd);
        showToast("Photo updated ✓");
        router.refresh();
      } catch (err) {
        setError(message(err, "Failed to upload the photo"));
      }
    });
  }

  function handleRemovePhoto() {
    if (!confirm("Remove your photo?")) return;
    setError(null);
    startPhoto(async () => {
      try {
        await removeMyAvatar();
        showToast("Photo removed ✓");
        router.refresh();
      } catch (err) {
        setError(message(err, "Failed to remove the photo"));
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <Avatar name={displayName || email} url={avatarUrl} size="xl" />
          {!readOnly && (
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              <Button type="button" size="sm" variant="ghost" disabled={photoPending} onClick={() => fileRef.current?.click()}>
                {photoPending ? "Saving…" : avatarUrl ? "Change" : "Add photo"}
              </Button>
              {avatarUrl && (
                <Button type="button" size="sm" variant="ghost" disabled={photoPending} onClick={handleRemovePhoto}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleName} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Your name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required disabled={readOnly} />
          </div>
          {!readOnly && (
            <Button type="submit" disabled={namePending || name.trim() === displayName}>
              {namePending ? "Saving…" : "Save name"}
            </Button>
          )}
        </form>
      </div>
      <div className="mt-4">
        <ErrorLine error={error} />
      </div>
    </Card>
  );
}

function ContactCard({ email, phone, readOnly }: { email: string; phone: string | null; readOnly: boolean }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [phonePending, startPhone] = useTransition();
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailPending, startEmail] = useTransition();
  const [emailError, setEmailError] = useState<string | null>(null);

  function handlePhone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhoneError(null);
    startPhone(async () => {
      try {
        const saved = await updateMyPhone(phoneValue);
        setPhoneValue(saved ?? "");
        showToast(saved ? "Phone saved ✓" : "Phone removed ✓");
      } catch (err) {
        setPhoneError(message(err, "Failed to save the phone"));
      }
    });
  }

  function handleEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    startEmail(async () => {
      try {
        const saved = await changeMyEmail(password, newEmail);
        setEditingEmail(false);
        setNewEmail("");
        setPassword("");
        showToast(`Email changed to ${saved} ✓`);
        router.refresh();
      } catch (err) {
        setEmailError(message(err, "Failed to change the email"));
      }
    });
  }

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Sign-in email</h2>
        <p className="mb-3 text-sm text-slate-500">
          You sign in with <span className="font-medium text-slate-700">{email}</span>.
        </p>
        {!readOnly && !editingEmail && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditingEmail(true)}>
            Change email
          </Button>
        )}
        {editingEmail && (
          <form onSubmit={handleEmail} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>New email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" required />
              </div>
              <div>
                <Label>Your current password (to confirm)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            <ErrorLine error={emailError} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditingEmail(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={emailPending}>
                {emailPending ? "Changing…" : "Change email"}
              </Button>
            </div>
          </form>
        )}
      </div>

      <form onSubmit={handlePhone} className="border-t border-slate-100 pt-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Phone</h2>
        <p className="mb-3 text-sm text-slate-500">
          With the country code. WhatsApp notifications for you will go to this number.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Mobile number</Label>
            <Input
              type="tel"
              value={phoneValue}
              onChange={(e) => setPhoneValue(e.target.value)}
              placeholder="+44 7700 900123"
              autoComplete="tel"
              disabled={readOnly}
            />
          </div>
          {!readOnly && (
            <Button type="submit" disabled={phonePending || phoneValue.trim() === (phone ?? "")}>
              {phonePending ? "Saving…" : "Save phone"}
            </Button>
          )}
        </div>
        <div className="mt-3">
          <ErrorLine error={phoneError} />
        </div>
      </form>
    </Card>
  );
}

/** Re-authenticates with the current password before the change (see changePassword). */
function PasswordCard() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }
    startTransition(async () => {
      try {
        await changePassword(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        showToast("Password changed ✓");
      } catch (err) {
        setError(message(err, "Failed to change password"));
      }
    });
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Change password</h2>
        <div>
          <Label>Current password</Label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>New password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
        </div>

        <ErrorLine error={error} />

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
