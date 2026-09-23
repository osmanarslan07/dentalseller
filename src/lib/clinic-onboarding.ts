/** Setup progress for a clinic, in the order a new clinic naturally gets going. Pure — the
 * platform area fetches the inputs (counts and branding only, no patient data). */

export interface OnboardingStep {
  id: "branding" | "logo" | "telegram" | "first_seller" | "first_quote" | "first_patient";
  label: string;
  done: boolean;
  /** Who does it and where — shown while the step is still open. */
  hint: string;
}

export interface OnboardingInput {
  branding: { address: string; phone: string; email: string; logoUrl: string | null; telegramGroupChatId: string | null } | null;
  sellers: number;
  quotes: number;
  confirmedPatients: number;
}

export function computeOnboarding(input: OnboardingInput): OnboardingStep[] {
  const b = input.branding;
  return [
    {
      id: "branding",
      label: "Clinic details filled in",
      done: !!b && !!b.address.trim() && !!b.phone.trim() && !!b.email.trim(),
      hint: "Admin adds the address, phone and email under Settings → Confirmation letter branding.",
    },
    {
      id: "logo",
      label: "Logo uploaded",
      done: !!b?.logoUrl,
      hint: "Admin uploads it under Settings → Confirmation letter branding. It appears on letters and offers.",
    },
    {
      id: "telegram",
      label: "Telegram group connected",
      done: !!b?.telegramGroupChatId,
      hint: "Admin links the clinic's group under Settings → Team Telegram group so the team gets notifications.",
    },
    {
      id: "first_seller",
      label: "First seller added",
      done: input.sellers > 0,
      hint: "Admin adds sellers under Settings → Team.",
    },
    {
      id: "first_quote",
      label: "First quote created",
      done: input.quotes > 0,
      hint: "Anyone on the team creates one from the Quotes page.",
    },
    {
      id: "first_patient",
      label: "First patient confirmed",
      done: input.confirmedPatients > 0,
      hint: "Happens when a patient gets a confirmation date.",
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
