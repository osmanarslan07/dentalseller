"use client";

import { useActionState } from "react";
import { setMyDisplayName, NameState } from "@/lib/profile-actions";
import { Button, Input, Label } from "@/components/ui";

const initialState: NameState = { error: null };

export function WelcomeForm() {
  const [state, formAction, pending] = useActionState(setMyDisplayName, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label>Your name</Label>
        <Input name="display_name" required maxLength={60} placeholder="e.g. Ayşe Yılmaz" autoFocus />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
