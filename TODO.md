# TODO

## Activity logging gaps (found 2026-09-18)

`activity_log` is written for patient/visit CRUD and seller management, but several
mutation paths log nothing. Before building any feature that relies on activity_log
being complete (e.g. a per-patient history view), close these gaps:

- **`setPatientLogisticsFlag` / `setExtraVisitLogisticsFlag`** (`src/app/(app)/patients/actions.ts:530,546`)
  — the transfer/hotel "arranged" checkboxes in the ops dashboard. No record of who
  toggled them or when.
- **`quotes/actions.ts`** — `createQuote`, `updateQuote`, `duplicateQuote`, `deleteQuote`,
  `convertQuoteToPatient`. Entire quote lifecycle is unlogged, including who converted
  a quote into a live patient.
- **`settings/actions.ts`** — `saveSettings` (commission tiers/rates), `saveClinicBranding`,
  `saveDashboardCards`. No history of who changed commission rates or from what — the
  thing most likely to cause a payout dispute.
- **`tasks/actions.ts`** — `createTask`, `updateTask`, `setTaskStatus`, `deleteTask`.
- **`profile-actions.ts`** — `changePassword`, `updateDisplayName`. Even self-service
  password changes aren't logged.
- **`sendPatientTelegramMessage`** (`patients/actions.ts:368`), **`generateTelegramLinkCode`**
  (`telegram-actions.ts:17`).

Already logged correctly: `createPatient`, `updatePatient`, `reassignPatient`,
`deletePatient`, `addExtraVisit`, `updateExtraVisit`, `deleteExtraVisit`, and all of
`settings/team-actions.ts` (`addSeller`, `setSellerActive`, `setSellerRole`,
`adminResetPassword`).

## Possible feature: per-patient history tab

Add a "History" tab to `PatientFormModal.tsx` (alongside Details/Visit 1/Visit 2/Extra)
that queries `activity_log` filtered to that patient's `target_id` and reuses the
`describeActivity` formatting already written for the team page
(`src/app/(app)/team/page.tsx`). Blocked on closing the logging gaps above first —
otherwise the tab would silently omit logistics toggles, which is exactly what people
would open it to check.
