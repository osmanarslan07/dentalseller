"use client";

import { FormEvent, useState, useTransition } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { changePassword, updateDisplayName } from "@/lib/profile-actions";

export function AccountCard({ email, displayName }: { email: string; displayName: string }) {
  const { showToast } = useToast();

  const [name, setName] = useState(displayName);
  const [namePending, startNameTransition] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordPending, startPasswordTransition] = useTransition();
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameError(null);
    startNameTransition(async () => {
      try {
        await updateDisplayName(name);
        showToast("Name updated ✓");
      } catch (err) {
        setNameError(err instanceof Error ? err.message : "Failed to update name");
      }
    });
  }

  function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    startPasswordTransition(async () => {
      try {
        await changePassword(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        showToast("Password changed ✓");
      } catch (err) {
        setPasswordError(err instanceof Error ? err.message : "Failed to change password");
      }
    });
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Your account</h2>
      <p className="mb-5 text-sm text-slate-500">
        Signed in as <span className="font-medium text-slate-700">{email}</span>
      </p>

      <form onSubmit={handleNameSubmit} className="mb-6 flex items-end gap-2">
        <div className="flex-1">
          <Label>Your name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        <Button type="submit" disabled={namePending}>
          {namePending ? "Saving…" : "Save name"}
        </Button>
      </form>
      {nameError && <p className="-mt-4 mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{nameError}</p>}

      <form onSubmit={handlePasswordSubmit} className="space-y-3 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-medium text-slate-700">Change password</h3>
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
        <div className="grid grid-cols-2 gap-3">
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

        {passwordError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{passwordError}</p>}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={passwordPending}>
            {passwordPending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
