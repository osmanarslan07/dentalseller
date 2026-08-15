"use client";

import { useActionState, useState } from "react";
import { login, signup, AuthState } from "@/lib/auth-actions";
import { Button, Input, Label } from "@/components/ui";

const initialState: AuthState = { error: null };

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div>
      <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Sign up
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <Label>Email</Label>
          <Input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
