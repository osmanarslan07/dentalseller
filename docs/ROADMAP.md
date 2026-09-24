# Roadmap — sellers, roles, modules (and the lead/inbox future)

Agreed 2026-09-24 after feedback from a consultant who works with many clinics:

- In many clinics **sellers never log in**. They tell a **coordinator** what they discussed
  with the patient (treatment plan, price, travel dates); the coordinator enters the patient,
  picks who the seller was, and runs transfers, hotels, visits and payments.
- The coordinator must be able to pick a seller who **is a user**, or **type a name** for one
  who isn't. Coordinators don't need quotes or seller earnings.
- Clinics should be able to **buy parts of the product** (operations only, sales, …).
- Later: WhatsApp / Instagram / Facebook messages and Facebook lead ads flowing into the
  system (Kommo-style), leads → patients end to end.

Status legend: ☐ to do · ◐ in progress · ☑ done

---

## NOW

### Step A — Sellers as records, not accounts ◐ (built 2026-09-24, waiting for your test)

A seller is someone who gets credit (and commission) for a sale. A login account is someone
who uses the app. Until now these were the same thing; this step separates them.

Design:
- New `sellers` table, one list per clinic: `id, clinic_id, name, profile_id, is_active`.
- **Every clinic account has a seller record with the same id** (`sellers.id = profiles.id`,
  kept in sync by a trigger). All existing `responsible_seller_id` / `earned_by_seller_id`
  values stay exactly as they are — only the foreign keys move from `auth.users` to `sellers`.
  So commission can't change on migration day.
- A seller **without an account** is a seller record with `profile_id = null`.
- Linking a no-account seller to an account later = **merge** it into that account's seller
  record (patients, earned commission and commission rates move over).
- Deleting a login account no longer hands its patients to the admin: the seller record just
  loses its login and keeps its patients and earned commission.
- Patient gets two separate fields: **Seller** (credit/commission) and **Coordinator**
  (the team member who follows up).

To do:
- ☑ SQL: `sellers` table + RLS + profile→seller sync trigger + backfill from profiles
- ☑ SQL: move FKs (`responsible_seller_id`, `visit1/2_earned_by_seller_id`,
      `patient_visits.earned_by_seller_id`, `settings.user_id`) to `sellers`
- ☑ SQL: `patients.coordinator_id` (+ same-clinic guard)
- ☑ SQL: patient insert/reassign rules accept no-account sellers (admins only for now)
- ☑ SQL: `merge_sellers(from, into)` — admin only, bypasses the earned-by lock just for this
- ☑ SQL: admins can set commission rates for no-account sellers
- ☑ Snapshot commission attribution before, compare after (must be identical)
- ☑ Data layer: `getSellers()`, `Seller` type, seller names everywhere come from sellers
- ☑ New patient form: seller picker — pick a seller or type a new name (admins); sellers
      still create patients as themselves
- ☑ Patient page: change seller (with typed name), set coordinator
- ☑ Settings → Team: "Sellers without an account" — add, rename, deactivate, delete (if no
      patients), commission rates, link to an account (merge)
- ☑ Team performance page includes no-account sellers
- ☑ Telegram: new-patient and visit reminders go to the coordinator when the seller has no
      account; cron resolves clinics via `sellers`
- ☑ Follow-up "book visit 2" task goes to the coordinator (or whoever saved) when the seller
      has no account
- ☑ Delete account keeps patients with the (now no-account) seller record
- ☑ Patient phone numbers saved in international format (`+44…`), required country code —
      needed later to match incoming WhatsApp messages to patients
- ☑ Type-check + lint
- ☑ Committed on branch `feature/roles-modules` (not merged to master)
- ☐ Your test — part of the one consolidated checklist at the end

### Decisions for B–F (agreed 2026-09-24)

| Topic | Decision |
|---|---|
| Shipping | Everything on branch `feature/roles-modules`, one commit per step, pushed to GitHub (Vercel preview). Merge to master only after the user tests. DB changes go live as each step is built, so they **must keep the current master code working** (additive columns; old `profiles.role` / `is_admin()` kept in sync). NB: preview deployments use the production database — test with TEST patients. |
| Sales sees | All patients and calendar (as today); only their own commission. |
| Coordinator | Patients, visits, hotels, transfers, payments, prices/extras/discounts, files, tasks; **pick/type sellers and reassign**; **manage drivers & transfer settings**; **Accounting page**. No quotes, no earnings, no commission settings, no team management, no deleting patients. |
| Accountant | Accounting page, record payments, **every seller's earnings** (Team page). Patients read-only otherwise. No settings, no quotes. |
| Modules | Per-clinic toggles in /platform, **prefilled by plan** (Trial = all, Starter = Operations, Pro = all, Custom = manual), still editable by hand. |
| Discount | **Per visit, £ or %**, optional reason. Comes off that visit's total (treatment + extras). **Anyone who can edit money** may give one, no cap; always logged. |
| Files | **Plain list** per patient (no categories, not tied to visits). Private storage, clinic-only, expiring links, 20 MB per file. |

### Step B — Roles and permissions ◐ (built 2026-09-24, SQL not applied yet — waiting for your test)
Built as designed below. Notes:
- Catalog in `permissions` / `role_permissions`; `has_permission()`, `my_permissions()`,
  `member_roles()` (support mode → viewed-as member's roles, admin when viewing as nobody).
- Sales keeps two own-record rules outside the catalog, exactly as before: the responsible
  seller can reassign and delete their own patient.
- Prices (visit expected amounts) additionally need `money.edit` (DB trigger); coordinators
  may write only the transfer-default / driver-message columns of `clinic_config` (trigger).
- Adding team members now needs `team.manage` (the UI already only showed it to admins).
- Settings → Team: role tick-buttons per member and on the add form; last-admin and
  own-roles guards are in the database.
- `profiles.roles text[]` (multi-role: `admin`, `sales`, `coordinator`, `accountant`).
  Backfill: admin → {admin, sales}; seller → {sales} — nobody's access changes. Keep the old
  `profiles.role` column in sync by trigger (admin if 'admin' in roles, else seller) so the
  live master code and `is_admin()` keep working.
- `role_permissions (role, permission)` table = the catalog; helper `has_permission(uid, perm)`
  (security definer; in support mode the viewed-as member's roles, still under support's
  read-only lock).
- Permissions: `patients.view`, `patients.edit`, `patients.delete`, `sellers.assign`
  (pick/type any seller, reassign), `sellers.manage` (seller list + rates), `payments.record`,
  `money.edit` (prices, extras, discounts), `transfers.manage`, `drivers.manage`,
  `quotes.use`, `earnings.own`, `earnings.all`, `accounting.view`, `files.manage`,
  `tasks.use`, `team.manage`, `settings.clinic`, `activity.view`. Room for `leads.*` /
  `inbox.*` later.
- Admin = all. Sales = exactly what a seller can do today (check every current seller path).
  Coordinator / Accountant per the table above.
- Seller record active only for accounts with the Sales role (others hidden from pickers).
- Enforced in RLS (replace `is_admin()` checks where a permission fits), server actions
  (`requirePermission`), page guards and the nav (desktop + mobile More menu).
- Settings → Team: role checkboxes per member instead of Promote/Demote; roles chosen when
  adding a member. Guards: a clinic can never lose its last admin; nobody edits their own roles.

### Step C — Modules per clinic ◐ (built 2026-09-24, SQL not applied yet — waiting for your test)
Built as designed below. Notes: `sellers.manage` is core (the seller list stays with Sales
off; only the rates hide). Module switches sit in /platform → clinic → Plan & billing, next
to the plan picker that prefills them. Operations off also hides the flights/hotel card and
the dashboard's "Logistics not arranged" card.
- `clinics.modules text[]`, default all three: `operations`, `sales`, `accounting` (`inbox`
  reserved). Each permission belongs to a module or to core (patients, payments, tasks, files,
  team, settings are core).
- /platform clinic page: three switches + plan picker that prefills them.
- Effective permission = role permission AND module on — inside `has_permission()` too.
- Sales off: no Quotes, Earnings, commission settings, commission on the Team page, rates on
  the seller list; the Seller field stays (reports by seller). Operations off: no Transfers
  page, driver settings or transfer/hotel cards. Accounting off: no Accounting page.

### Step D — Activity log gaps ☐
- Close every gap listed in `TODO.md` (quote lifecycle, commission/branding/system/dashboard
  settings, tasks, profile name/password, Telegram send + link code), then trim TODO.md.

### Step E — Discounts ☐
- Columns: `visit1_/visit2_discount_type` ('amount' | 'percent'), `_discount_value`,
  `_discount_reason` on patients; `discount_type/value/reason` on patient_visits.
  Discount = % of (price + extras) or the amount, never more than the total.
- One helper (`visitDiscount`) used everywhere a visit's total is computed. Affected:
  `visitExpectedTotal` / `treatmentTotal` (commission.ts → expected commission); owed / still
  due / due-now badges (balance.ts); Money card (Price → Extras → **Discount** → Owed →
  Payments → Still due); Visits at a glance; patient header badges; patients list and CSV
  export; Accounting open balances; dashboard cards (upcoming value, avg treatment value,
  highest value patient); Telegram visit message ("İndirim"); confirmation letter and
  operations sheet; "mark completed" mismatch check; History / activity log.
- Paid commission is unaffected by design (actual = sum of payments).

### Step F — Patient files ☐
- Private Storage bucket `patient-files`, path `{clinic_id}/{patient_id}/{uuid}-{name}`;
  storage RLS by clinic folder; opened via 1-hour signed links. 20 MB per file; images, PDF,
  Office docs, text.
- `patient_files` table (id, clinic_id, patient_id, name, path, size, mime, uploaded_by,
  created_at). Deleting a patient removes their files from storage too.
- Patient info tab: "Files" card — upload (several at once; phone camera works), list with
  name / size / who / when, open, rename, delete (uploader or admin). Logged in History.

### Finish ☐
- One consolidated test checklist for the user; merge to master after approval.

## Working notes for a new session (cloud or local)

- Next.js here is newer than training data — read `node_modules/next/dist/docs/` before
  unfamiliar APIs (see AGENTS.md).
- `supabase/schema.sql` is the single idempotent migration file: append new sections before
  the "ONE-TIME MANUAL STEP" block, always safe to re-run. It has CRLF line endings.
- Apply SQL through the Supabase Management API:
  `POST https://api.supabase.com/v1/projects/{ref}/database/query` with header
  `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`, JSON body `{"query": "..."}`; `ref` is the
  subdomain of `NEXT_PUBLIC_SUPABASE_URL`. Dry-run first inside `begin; … rollback;`. Test RLS
  with `set local role authenticated` plus
  `select set_config('request.jwt.claims', '{"sub":"<user id>","role":"authenticated"}', true)`.
  A cloud session needs those two env vars in its environment, otherwise it can only write the
  SQL for the user to apply.
- Never put `$$` in a JS `String.replace` replacement string (it becomes `$`) — use a function
  replacer when editing schema.sql from scripts.
- Verify with `npx tsc --noEmit` and `npx eslint src --quiet`. Two lint errors are pre-existing
  and not ours: `earnings/page.tsx` and `components/RelativeTime.tsx` (Date.now in render).
  Don't run `next build` while `next dev` is running.
- The user can't test between steps: finish all steps, then give ONE consolidated checklist.
- Support mode: `getActingUser()` in actions (id = viewed-as member, actorId = real actor);
  `getViewerUser()` for "me" in pages. Superadmins never see patient PII outside support mode.
- Test data in prod must be named "TEST …".

---

## LATER (design for it now, don't build yet)

- **Leads**: leads table, owner = a seller record, manual entry/import, and the pipeline below.
- **Lead distribution**: when a lead arrives, assign it to a seller automatically — equally
  (round-robin) or weighted (e.g. seller A gets 50%, B and C 25% each), set per clinic.
- **Pipeline stages** (as used today in Kommo — make the list editable per clinic):
  1. **New lead** — just arrived (ad form, message, manual).
  2. **In progress** — a seller is talking to them.
  3. **Photo follow-up** 🤖 — no photos received yet. A bot sends template follow-ups on a
     schedule (e.g. one a day for 5 days). No reply by the end → **No response**.
     A reply → the bot tags the seller ("patient replied"), the seller is notified, and the
     lead moves to **Consultation**.
  4. **Consultation** — photos in, seller/doctor discussing the plan.
  5. **Quote** — a quote has been shared.
  6. **Quote follow-up** 🤖 — no answer after the quote: bot sends quote-related follow-ups;
     still nothing → **No response**.
  7. **Hot** — quote accepted, or the conversation is going well.
  8. **Waiting for ticket** — agreed, waiting for them to book flights.
  9. **Ticket follow-up** 🤖 — seller chooses it when the patient goes quiet here; bot
     follow-ups, then **No response** if still nothing.
  10. **No response** — parked; followed up rarely and checked now and then.
  11. **Confirmed** — the lead becomes a patient (convert: seller, quote, conversation carry over).
  12. **Lost** — closed with a reason picked from a list (price, went elsewhere, not a
      candidate, …) so lost reasons can be reported on.
- **Follow-up bots** 🤖: each follow-up stage has its own sequence of template messages
  (you'll provide the templates), a schedule (every N days, how many times), what happens on
  a reply (tag + notify the seller, move stage) and on no reply (move to No response). Stop
  as soon as the patient answers or a person moves the lead. WhatsApp only allows free text
  within 24 h of the patient's last message — after that, follow-ups must be Meta-approved
  templates, so each bot message needs an approved template version.
- **Lead conversations / inbox**: WhatsApp first (reuses the Step-10 webhook + encrypted
  secrets), then Messenger and Instagram DMs. Needs Meta business verification and app review
  (weeks of lead time — start before building).
- **Lead ads**: Facebook/Instagram lead forms create leads automatically.
- **Convert lead → patient**: carries seller, quote and conversation history over
  (lead → quote → patient; quote → patient already exists).

How NOW prepares for LATER:
- Sellers are a standalone list, so leads can point at them.
- Phones are stored in international format, so WhatsApp messages can be matched.
- Permissions and modules are data, so `leads.*` / `inbox.*` slot in without redesign.
- The activity log is already generic (`target_type`), so lead history fits in.
- WhatsApp templates + webhook (Step 10) are the same machinery the follow-up bots will use.
