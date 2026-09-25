"use client";

import { useActionState } from "react";
import { login, AuthState } from "@/lib/auth-actions";
import { Button, Input, Label } from "@/components/ui";
import { useT } from "@/i18n/client";

const initialState: AuthState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const t = useT();

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label>{t("Email")}</Label>
        <Input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
      </div>
      <div>
        <Label>{t("Password")}</Label>
        <Input
          type="password"
          name="password"
          required
          minLength={6}
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("Please wait…") : t("Log in")}
      </Button>
    </form>
  );
}
