-- DentalSeller — schema + RLS
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

-- ---------- patients ----------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  name text not null,
  treatment text,
  letter_treatment_items text,
  confirmation_date date,

  visit1_date date,
  visit1_expected numeric(10,2),
  visit1_actual numeric(10,2),
  visit1_status text not null default 'upcoming' check (visit1_status in ('upcoming', 'completed')),

  visit2_date date,
  visit2_expected numeric(10,2),
  visit2_actual numeric(10,2),
  visit2_status text not null default 'upcoming' check (visit2_status in ('upcoming', 'completed')),

  notes text,
  komo_reference text,

  visit1_arrival_date date,
  visit1_arrival_time text,
  visit1_arrival_flight_no text,
  visit1_departure_date date,
  visit1_departure_time text,
  visit1_departure_flight_no text,
  visit1_hotel_name text,
  visit1_room_type text,

  visit2_arrival_date date,
  visit2_arrival_time text,
  visit2_arrival_flight_no text,
  visit2_departure_date date,
  visit2_departure_time text,
  visit2_departure_flight_no text,
  visit2_hotel_name text,
  visit2_room_type text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration for existing databases (safe to re-run)
alter table public.patients drop column if exists arrival_date;
alter table public.patients drop column if exists arrival_time;
alter table public.patients drop column if exists arrival_flight_no;
alter table public.patients drop column if exists departure_date;
alter table public.patients drop column if exists departure_time;
alter table public.patients drop column if exists departure_flight_no;
alter table public.patients drop column if exists hotel_name;
alter table public.patients drop column if exists room_type;

alter table public.patients add column if not exists komo_reference text;
alter table public.patients add column if not exists letter_treatment_items text;
alter table public.patients add column if not exists needs_visit2 boolean not null default true;

alter table public.patients add column if not exists visit1_arrival_date date;
alter table public.patients add column if not exists visit1_arrival_time text;
alter table public.patients add column if not exists visit1_arrival_flight_no text;
alter table public.patients add column if not exists visit1_departure_date date;
alter table public.patients add column if not exists visit1_departure_time text;
alter table public.patients add column if not exists visit1_departure_flight_no text;
alter table public.patients add column if not exists visit1_hotel_name text;
alter table public.patients add column if not exists visit1_room_type text;

alter table public.patients add column if not exists visit2_arrival_date date;
alter table public.patients add column if not exists visit2_arrival_time text;
alter table public.patients add column if not exists visit2_arrival_flight_no text;
alter table public.patients add column if not exists visit2_departure_date date;
alter table public.patients add column if not exists visit2_departure_time text;
alter table public.patients add column if not exists visit2_departure_flight_no text;
alter table public.patients add column if not exists visit2_hotel_name text;
alter table public.patients add column if not exists visit2_room_type text;

create index if not exists patients_user_id_idx on public.patients(user_id);
create index if not exists patients_visit1_date_idx on public.patients(visit1_date);
create index if not exists patients_visit2_date_idx on public.patients(visit2_date);

alter table public.patients enable row level security;

create policy "patients_select_own" on public.patients
  for select using (auth.uid() = user_id);
create policy "patients_insert_own" on public.patients
  for insert with check (auth.uid() = user_id);
create policy "patients_update_own" on public.patients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "patients_delete_own" on public.patients
  for delete using (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- ---------- patient_visits (extra visits between visit 1 and visit 2, e.g. temp crown fix) ----------
create table if not exists public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  label text not null,
  visit_date date,
  expected numeric(10,2),
  actual numeric(10,2),
  status text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  treatment text,
  notes text,

  arrival_date date,
  arrival_time text,
  arrival_flight_no text,
  departure_date date,
  departure_time text,
  departure_flight_no text,
  hotel_name text,
  room_type text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration for existing databases (safe to re-run)
alter table public.patient_visits add column if not exists treatment text;
alter table public.patient_visits add column if not exists arrival_date date;
alter table public.patient_visits add column if not exists arrival_time text;
alter table public.patient_visits add column if not exists arrival_flight_no text;
alter table public.patient_visits add column if not exists departure_date date;
alter table public.patient_visits add column if not exists departure_time text;
alter table public.patient_visits add column if not exists departure_flight_no text;
alter table public.patient_visits add column if not exists hotel_name text;
alter table public.patient_visits add column if not exists room_type text;

create index if not exists patient_visits_patient_id_idx on public.patient_visits(patient_id);
create index if not exists patient_visits_visit_date_idx on public.patient_visits(visit_date);

alter table public.patient_visits enable row level security;

drop policy if exists "patient_visits_select_own" on public.patient_visits;
create policy "patient_visits_select_own" on public.patient_visits
  for select using (auth.uid() = user_id);
drop policy if exists "patient_visits_insert_own" on public.patient_visits;
create policy "patient_visits_insert_own" on public.patient_visits
  for insert with check (auth.uid() = user_id);
drop policy if exists "patient_visits_update_own" on public.patient_visits;
create policy "patient_visits_update_own" on public.patient_visits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "patient_visits_delete_own" on public.patient_visits;
create policy "patient_visits_delete_own" on public.patient_visits
  for delete using (auth.uid() = user_id);

drop trigger if exists patient_visits_set_updated_at on public.patient_visits;
create trigger patient_visits_set_updated_at
  before update on public.patient_visits
  for each row execute function public.set_updated_at();

-- ---------- settings (one row per user) ----------
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  low_tier_threshold numeric(12,2) not null default 70000,
  low_tier_rate numeric(5,4) not null default 0.03,
  high_tier_rate numeric(5,4) not null default 0.04,
  currency text not null default 'GBP',
  updated_at timestamptz not null default now()
);

-- 3-tier commission + fixed monthly payment (replaces the 2-tier columns above; old columns left in place, unused)
alter table public.settings add column if not exists tier1_threshold numeric(12,2) not null default 40000;
alter table public.settings add column if not exists tier1_rate numeric(5,4) not null default 0.02;
alter table public.settings add column if not exists tier2_threshold numeric(12,2) not null default 70000;
alter table public.settings add column if not exists tier2_rate numeric(5,4) not null default 0.03;
alter table public.settings add column if not exists tier3_rate numeric(5,4) not null default 0.04;
alter table public.settings add column if not exists fixed_monthly_payment numeric(12,2) not null default 0;
alter table public.settings add column if not exists hide_earnings boolean not null default false;
-- Whether celebration moments (payment received, tier jump, etc.) play a short chime
-- alongside their confetti — personal preference, on by default.
alter table public.settings add column if not exists celebration_sound boolean not null default true;
alter table public.settings add column if not exists show_try boolean not null default false;
alter table public.settings add column if not exists dashboard_cards text[] not null default array[
  'total_earned', 'month_earnings', 'expected_earnings', 'patients_sold', 'confirmed_this_month',
  'new_patients_delta', 'upcoming_visits_value', 'avg_commission_patient', 'avg_treatment_value',
  'highest_value_patient'
]::text[];

-- new card added later: bump the column default so freshly-created settings rows include it
-- (existing rows keep whatever they already have saved — toggle it on from Settings)
alter table public.settings alter column dashboard_cards set default array[
  'total_earned', 'total_commission', 'month_earnings', 'expected_earnings', 'patients_sold',
  'confirmed_this_month', 'new_patients_delta', 'upcoming_visits_value', 'avg_commission_patient',
  'avg_treatment_value', 'highest_value_patient'
]::text[];

-- confirmation-letter clinic branding (name/contact/logo), editable from Settings
alter table public.settings add column if not exists clinic_name text not null default 'Thera Dental Clinic Turkey';
alter table public.settings add column if not exists clinic_short_name text not null default 'Thera Dental Clinic';
alter table public.settings add column if not exists clinic_address text not null default 'Kasya Plaza, Göksu, 6806 Sok No:8-3, 07260 Kepez/Antalya';
alter table public.settings add column if not exists clinic_phone text not null default '+90 (544) 954 04 49';
alter table public.settings add column if not exists clinic_email text not null default 'info@theradentturkey.com';
alter table public.settings add column if not exists clinic_logo_url text;

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------- exchange_rates (shared history, not per-user) ----------
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null,
  quote text not null default 'TRY',
  rate numeric(12,4) not null,
  rate_date date not null,
  created_at timestamptz not null default now(),
  unique (base, quote, rate_date)
);

create index if not exists exchange_rates_date_idx on public.exchange_rates(rate_date);

alter table public.exchange_rates enable row level security;

-- readable by any signed-in user; only the service role (cron job) inserts
create policy "exchange_rates_select_all" on public.exchange_rates
  for select using (true);

-- ---------- quotes (draft/unconfirmed offers, decoupled from patients) ----------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  name text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),

  intro_text text,
  inclusions text,

  total_price numeric(10,2),
  currency text not null default 'GBP',
  split_mode text not null default 'percent' check (split_mode in ('percent', 'amount')),
  deposit_percent numeric(5,2) not null default 60,
  first_visit_amount numeric(10,2),

  include_bone_graft_note boolean not null default false,
  bone_graft_note text,

  notes text,
  komo_reference text,

  converted_patient_id uuid references public.patients(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- migration for existing databases (safe to re-run)
alter table public.quotes add column if not exists split_mode text not null default 'percent' check (split_mode in ('percent', 'amount'));
alter table public.quotes add column if not exists first_visit_amount numeric(10,2);
alter table public.quotes add column if not exists label text;

create index if not exists quotes_user_id_idx on public.quotes(user_id);
create index if not exists quotes_status_idx on public.quotes(status);

alter table public.quotes enable row level security;

create policy "quotes_select_own" on public.quotes
  for select using (auth.uid() = user_id);
create policy "quotes_insert_own" on public.quotes
  for insert with check (auth.uid() = user_id);
create policy "quotes_update_own" on public.quotes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quotes_delete_own" on public.quotes
  for delete using (auth.uid() = user_id);

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- ---------- tasks (reminders, optionally linked to a patient) ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),

  title text not null,
  notes text,

  due_date date not null,
  due_time text,

  patient_id uuid references public.patients(id) on delete set null,
  patient_name text,

  status text not null default 'pending' check (status in ('pending', 'done')),
  notified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_status_idx on public.tasks(status);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------- profiles (one row per auth user — the seller directory) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'seller' check (role in ('seller', 'admin')),
  telegram_chat_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- security-definer helpers so RLS policies/triggers can check role/active status
-- without re-entering RLS on profiles themselves (avoids self-referential recursion).
create or replace function public.is_active_profile(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_active from public.profiles where id = uid), false);
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

-- auto-create a bare profile row whenever a new auth user is created
-- (covers accounts made via admin.createUser, the Supabase dashboard, etc).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- only admin may change role/is_active — anyone can still update their own
-- display_name/telegram_chat_id via the normal update policy below.
create or replace function public.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can change role or active status';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privilege on public.profiles;
create trigger profiles_guard_privilege
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_change();

alter table public.profiles enable row level security;

-- any active seller can see the whole directory (needed for "Responsible: X" badges,
-- assignment dropdowns, admin team view).
drop policy if exists "profiles_select_active_sellers" on public.profiles;
create policy "profiles_select_active_sellers" on public.profiles
  for select using (public.is_active_profile(auth.uid()));

-- everyone can update their own row (display_name, telegram_chat_id); admin can update anyone's.
-- the trigger above still blocks a non-admin from smuggling a role/is_active change through this.
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin(auth.uid()))
  with check (auth.uid() = id or public.is_admin(auth.uid()));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- shared patients: rename ownership column + open visibility to all active sellers ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patients' and column_name = 'user_id'
  ) then
    alter table public.patients rename column user_id to responsible_seller_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patient_visits' and column_name = 'user_id'
  ) then
    alter table public.patient_visits rename column user_id to created_by_seller_id;
  end if;
end $$;

alter index if exists patients_user_id_idx rename to patients_responsible_seller_id_idx;

drop policy if exists "patients_select_own" on public.patients;
drop policy if exists "patients_insert_own" on public.patients;
drop policy if exists "patients_update_own" on public.patients;
drop policy if exists "patients_delete_own" on public.patients;

drop policy if exists "patients_select_active_sellers" on public.patients;
create policy "patients_select_active_sellers" on public.patients
  for select using (public.is_active_profile(auth.uid()));

drop policy if exists "patients_insert_self" on public.patients;
create policy "patients_insert_self" on public.patients
  for insert with check (responsible_seller_id = auth.uid() and public.is_active_profile(auth.uid()));

-- any active seller can edit (arrange logistics for a colleague's patient); reassigning
-- responsible_seller_id itself is separately guarded by the trigger below.
drop policy if exists "patients_update_active_sellers" on public.patients;
create policy "patients_update_active_sellers" on public.patients
  for update using (public.is_active_profile(auth.uid()))
  with check (public.is_active_profile(auth.uid()));

drop policy if exists "patients_delete_owner_or_admin" on public.patients;
create policy "patients_delete_owner_or_admin" on public.patients
  for delete using (responsible_seller_id = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.guard_patient_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_seller_id is distinct from old.responsible_seller_id
     and not (auth.uid() = old.responsible_seller_id or public.is_admin(auth.uid())) then
    raise exception 'Only the responsible seller or an admin can reassign this patient';
  end if;
  return new;
end;
$$;

drop trigger if exists patients_guard_reassignment on public.patients;
create trigger patients_guard_reassignment
  before update on public.patients
  for each row execute function public.guard_patient_reassignment();

drop policy if exists "patient_visits_select_own" on public.patient_visits;
drop policy if exists "patient_visits_insert_own" on public.patient_visits;
drop policy if exists "patient_visits_update_own" on public.patient_visits;
drop policy if exists "patient_visits_delete_own" on public.patient_visits;

drop policy if exists "patient_visits_select_active_sellers" on public.patient_visits;
create policy "patient_visits_select_active_sellers" on public.patient_visits
  for select using (public.is_active_profile(auth.uid()));

drop policy if exists "patient_visits_insert_active_sellers" on public.patient_visits;
create policy "patient_visits_insert_active_sellers" on public.patient_visits
  for insert with check (created_by_seller_id = auth.uid() and public.is_active_profile(auth.uid()));

drop policy if exists "patient_visits_update_active_sellers" on public.patient_visits;
create policy "patient_visits_update_active_sellers" on public.patient_visits
  for update using (public.is_active_profile(auth.uid()))
  with check (public.is_active_profile(auth.uid()));

drop policy if exists "patient_visits_delete_active_sellers" on public.patient_visits;
create policy "patient_visits_delete_active_sellers" on public.patient_visits
  for delete using (public.is_active_profile(auth.uid()));

-- admin can also read every seller's commission settings (for a future cross-seller
-- breakdown view); each seller's own row otherwise stays private via settings_select_own.
drop policy if exists "settings_select_admin" on public.settings;
create policy "settings_select_admin" on public.settings
  for select using (public.is_admin(auth.uid()));

-- ---------- telegram_link_codes (short-lived, one-time codes to link a seller's own chat) ----------
create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes(user_id);

alter table public.telegram_link_codes enable row level security;

-- a seller can create their own code; nothing else is exposed to normal clients — the
-- webhook that verifies/consumes a code runs with the service-role key, which bypasses RLS.
drop policy if exists "telegram_link_codes_insert_own" on public.telegram_link_codes;
create policy "telegram_link_codes_insert_own" on public.telegram_link_codes
  for insert with check (user_id = auth.uid());

-- ---------- activity_log (admin-only audit trail for security-relevant actions) ----------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_at_idx on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;

-- only admin can read the log; any signed-in user can log their own action (admin-only
-- actions that use the service-role client bypass RLS entirely, so this is enough).
drop policy if exists "activity_log_select_admin" on public.activity_log;
create policy "activity_log_select_admin" on public.activity_log
  for select using (public.is_admin(auth.uid()));

drop policy if exists "activity_log_insert_self" on public.activity_log;
create policy "activity_log_insert_self" on public.activity_log
  for insert with check (actor_id = auth.uid());

-- ---------- clinic_config (singleton row — clinic-wide settings, not tied to any one seller) ----------
create table if not exists public.clinic_config (
  id boolean primary key default true check (id),
  telegram_group_chat_id text,
  updated_at timestamptz not null default now()
);
insert into public.clinic_config (id) values (true) on conflict (id) do nothing;

-- confirmation-letter/quote-offer branding, moved here from the per-seller `settings` table —
-- one shared identity for every patient's letter, not whatever each seller's own row happened
-- to have. Editable by admins only; any active seller can read it (see select policy below).
alter table public.clinic_config add column if not exists clinic_name text not null default 'Thera Dental Clinic Turkey';
alter table public.clinic_config add column if not exists clinic_short_name text not null default 'Thera Dental Clinic';
alter table public.clinic_config add column if not exists clinic_address text not null default 'Kasya Plaza, Göksu, 6806 Sok No:8-3, 07260 Kepez/Antalya';
alter table public.clinic_config add column if not exists clinic_phone text not null default '+90 (544) 954 04 49';
alter table public.clinic_config add column if not exists clinic_email text not null default 'info@theradentturkey.com';
alter table public.clinic_config add column if not exists clinic_logo_url text;

alter table public.clinic_config enable row level security;

-- any active seller can read it (their own confirmation letters/quote offers need it); only
-- admins can change it.
drop policy if exists "clinic_config_select_admin" on public.clinic_config;
drop policy if exists "clinic_config_select_active" on public.clinic_config;
create policy "clinic_config_select_active" on public.clinic_config
  for select using (public.is_active_profile(auth.uid()));
drop policy if exists "clinic_config_update_admin" on public.clinic_config;
create policy "clinic_config_update_admin" on public.clinic_config
  for update using (public.is_admin(auth.uid()));
drop policy if exists "clinic_config_insert_admin" on public.clinic_config;
create policy "clinic_config_insert_admin" on public.clinic_config
  for insert with check (public.is_admin(auth.uid()));

drop trigger if exists clinic_config_set_updated_at on public.clinic_config;
create trigger clinic_config_set_updated_at
  before update on public.clinic_config
  for each row execute function public.set_updated_at();

-- ---------- per-visit commission attribution ----------
-- Locks in "who earned this" the moment a payment is actually recorded, so reassigning a
-- patient later never drags already-earned commission along to the new seller — only visits
-- still unpaid at reassignment time follow the new owner (see reassignPatient in the app).
alter table public.patients add column if not exists visit1_earned_by_seller_id uuid references auth.users(id) on delete set null;
alter table public.patients add column if not exists visit2_earned_by_seller_id uuid references auth.users(id) on delete set null;
alter table public.patient_visits add column if not exists earned_by_seller_id uuid references auth.users(id) on delete set null;

-- Owns visit1/visit2_earned_by_seller_id entirely: once set it can't be moved by a client
-- update (the trigger keeps whatever OLD had), and it clears itself if a payment is un-recorded.
create or replace function public.set_patient_visit_earned_by()
returns trigger as $$
begin
  if new.visit1_actual is null then
    new.visit1_earned_by_seller_id := null;
  elsif TG_OP = 'UPDATE' and old.visit1_earned_by_seller_id is not null then
    new.visit1_earned_by_seller_id := old.visit1_earned_by_seller_id;
  else
    new.visit1_earned_by_seller_id := new.responsible_seller_id;
  end if;

  if new.visit2_actual is null then
    new.visit2_earned_by_seller_id := null;
  elsif TG_OP = 'UPDATE' and old.visit2_earned_by_seller_id is not null then
    new.visit2_earned_by_seller_id := old.visit2_earned_by_seller_id;
  else
    new.visit2_earned_by_seller_id := new.responsible_seller_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists patients_set_visit_earned_by on public.patients;
create trigger patients_set_visit_earned_by
  before insert or update on public.patients
  for each row execute function public.set_patient_visit_earned_by();

-- Same rule for extra visits, credited against whichever seller currently owns the parent
-- patient at the moment the payment is recorded.
create or replace function public.set_extra_visit_earned_by()
returns trigger as $$
begin
  if new.actual is null then
    new.earned_by_seller_id := null;
  elsif TG_OP = 'UPDATE' and old.earned_by_seller_id is not null then
    new.earned_by_seller_id := old.earned_by_seller_id;
  else
    select responsible_seller_id into new.earned_by_seller_id from public.patients where id = new.patient_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists patient_visits_set_earned_by on public.patient_visits;
create trigger patient_visits_set_earned_by
  before insert or update on public.patient_visits
  for each row execute function public.set_extra_visit_earned_by();

-- Backfill: existing completed visits keep crediting whoever currently owns the patient —
-- matches today's behavior exactly, so nothing moves on migration day. Only reassignments
-- from this point on stop dragging already-earned commission along with them.
update public.patients
set visit1_earned_by_seller_id = responsible_seller_id
where visit1_actual is not null and visit1_earned_by_seller_id is null;

update public.patients
set visit2_earned_by_seller_id = responsible_seller_id
where visit2_actual is not null and visit2_earned_by_seller_id is null;

update public.patient_visits pv
set earned_by_seller_id = p.responsible_seller_id
from public.patients p
where pv.patient_id = p.id and pv.actual is not null and pv.earned_by_seller_id is null;

-- ---------- operations checklist: arrival/departure transfer + hotel arranged per visit ----------
-- Plain editable flags (any active seller can tick them, same as the hotel/flight fields they
-- sit next to) — not tracked historically, unlike the earned_by columns above. Arrival and
-- departure transfers are split since they're arranged separately, often at very different
-- times; hotel stays a single flag since booking a room is one action, not two.
alter table public.patients drop column if exists visit1_transfer_arranged;
alter table public.patients drop column if exists visit2_transfer_arranged;

alter table public.patients add column if not exists visit1_arrival_transfer_arranged boolean not null default false;
alter table public.patients add column if not exists visit1_departure_transfer_arranged boolean not null default false;
alter table public.patients add column if not exists visit1_hotel_arranged boolean not null default false;
alter table public.patients add column if not exists visit2_arrival_transfer_arranged boolean not null default false;
alter table public.patients add column if not exists visit2_departure_transfer_arranged boolean not null default false;
alter table public.patients add column if not exists visit2_hotel_arranged boolean not null default false;

alter table public.patient_visits drop column if exists transfer_arranged;

alter table public.patient_visits add column if not exists arrival_transfer_arranged boolean not null default false;
alter table public.patient_visits add column if not exists departure_transfer_arranged boolean not null default false;
alter table public.patient_visits add column if not exists hotel_arranged boolean not null default false;

-- ---------- visit 2 recall period (drives the auto-created follow-up task) ----------
-- How many months after visit 1 the patient should come back for visit 2 — varies by
-- treatment (implant healing time etc.), so it's editable per patient rather than a fixed
-- global assumption. Defaults to 3, the common case.
alter table public.patients add column if not exists visit2_recall_months integer not null default 3 check (visit2_recall_months > 0);

-- ---------- storage: clinic-assets (confirmation-letter logo) ----------
-- public read, uploads go through the server action using the service-role client
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-assets', 'clinic-assets', true, 2097152, array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- =====================================================================
-- MULTI-TENANT MIGRATION — Phase 1: clinics table, clinic_id everywhere,
-- superadmin role. Idempotent/safe to re-run, same as everything above.
-- Nothing in the app changes behavior yet — this is pure schema/RLS.
-- =====================================================================

-- ---------- clinics (tenants) ----------
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.clinics enable row level security;

-- ---------- clinic_id added to every clinic-scoped table (nullable for now — backfilled
-- and locked down below, in that order, since a couple of the steps that follow depend on
-- data already being backfilled before they can run) ----------
alter table public.profiles add column if not exists clinic_id uuid references public.clinics(id);
alter table public.patients add column if not exists clinic_id uuid references public.clinics(id);
alter table public.patient_visits add column if not exists clinic_id uuid references public.clinics(id);
alter table public.quotes add column if not exists clinic_id uuid references public.clinics(id);
alter table public.tasks add column if not exists clinic_id uuid references public.clinics(id);
alter table public.settings add column if not exists clinic_id uuid references public.clinics(id);
alter table public.telegram_link_codes add column if not exists clinic_id uuid references public.clinics(id);
-- nullable permanently: a superadmin action (e.g. "created clinic X") isn't scoped to any one clinic
alter table public.activity_log add column if not exists clinic_id uuid references public.clinics(id);

create or replace function public.is_superadmin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = uid), false);
$$;

-- the caller's own clinic — used throughout RLS below instead of repeating the subselect;
-- security definer for the same self-referential-recursion reason as is_admin()/is_active_profile().
create or replace function public.my_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select clinic_id from public.profiles where id = auth.uid();
$$;

-- ---------- backfill: everything that exists today belongs to one clinic. Must run before
-- the role/clinic check constraints below (a fresh check constraint validates every existing
-- row immediately) and before guard_profile_privilege_change() is tightened to forbid
-- clinic_id changes (this backfill IS a clinic_id change, and would trip its own new guard
-- if that guard were already active) ----------
insert into public.clinics (name, slug)
select 'Thera Dental Clinic Turkey', 'thera'
where not exists (select 1 from public.clinics);

do $$
declare
  default_clinic_id uuid;
begin
  select id into default_clinic_id from public.clinics order by created_at asc limit 1;

  -- excludes superadmins: their clinic_id is intentionally null, and stays that way on
  -- every re-run of this script too (matters once a superadmin has actually been promoted)
  update public.profiles set clinic_id = default_clinic_id where clinic_id is null and role <> 'superadmin';
  update public.patients set clinic_id = default_clinic_id where clinic_id is null;
  update public.patient_visits set clinic_id = default_clinic_id where clinic_id is null;
  update public.quotes set clinic_id = default_clinic_id where clinic_id is null;
  update public.tasks set clinic_id = default_clinic_id where clinic_id is null;
  update public.settings set clinic_id = default_clinic_id where clinic_id is null;
  update public.telegram_link_codes set clinic_id = default_clinic_id where clinic_id is null;
  update public.activity_log set clinic_id = default_clinic_id where clinic_id is null;
end $$;

-- ---------- now that every existing profile has a clinic_id, add the role/clinic
-- constraints and lock clinic_id down ----------

-- drop whatever the original inline `check (role in (...))` constraint ended up named,
-- without hardcoding Postgres's auto-generated name
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
      and pg_get_constraintdef(oid) ilike '%seller%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check
  check (role in ('seller', 'admin', 'superadmin'));

-- A superadmin must never have a clinic — that's the one state that's actually dangerous
-- (platform-wide access scoped to a single tenant makes no sense) and it's the only half we
-- can enforce as a hard CHECK. A seller/admin with clinic_id still null is a real, if
-- transient, state: handle_new_user() inserts a bare profile row (role defaults to
-- 'seller', clinic_id null) the moment an auth user is created, in its own request/
-- transaction, separate from whatever app code runs next to assign clinic_id (addSeller,
-- clinic creation, ...) — there's no way to make that atomic across the Auth API boundary,
-- so a hard NOT NULL-style check here would intermittently break account creation itself.
-- RLS already makes an unassigned profile harmless: every clinic-scoped policy requires
-- clinic_id = my_clinic_id(), which a null clinic_id can never satisfy, so such a row can
-- see and do nothing until the app finishes assigning it a clinic.
alter table public.profiles drop constraint if exists profiles_clinic_role_check;
alter table public.profiles add constraint profiles_clinic_role_check
  check (not (role = 'superadmin' and clinic_id is not null));

-- clinic_id itself is never changed through the normal update path from here on (not a
-- supported product operation — only a manual/service-role move between tenants, which
-- doesn't exist today). Safe to introduce now that the one legitimate clinic_id change
-- (the backfill above) has already happened.
create or replace function public.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can change role or active status';
  end if;
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'clinic_id cannot be changed directly';
  end if;
  return new;
end;
$$;

alter table public.patients alter column clinic_id set not null;
alter table public.patient_visits alter column clinic_id set not null;
alter table public.quotes alter column clinic_id set not null;
alter table public.tasks alter column clinic_id set not null;
alter table public.settings alter column clinic_id set not null;
alter table public.telegram_link_codes alter column clinic_id set not null;

create index if not exists patients_clinic_id_idx on public.patients(clinic_id);
create index if not exists patient_visits_clinic_id_idx on public.patient_visits(clinic_id);
create index if not exists quotes_clinic_id_idx on public.quotes(clinic_id);
create index if not exists tasks_clinic_id_idx on public.tasks(clinic_id);
create index if not exists profiles_clinic_id_idx on public.profiles(clinic_id);
create index if not exists activity_log_clinic_id_idx on public.activity_log(clinic_id);

-- ---------- clinics: superadmin manages every row; anyone can read their own ----------
drop policy if exists "clinics_select_own" on public.clinics;
create policy "clinics_select_own" on public.clinics
  for select using (id = public.my_clinic_id());

drop policy if exists "clinics_select_superadmin" on public.clinics;
create policy "clinics_select_superadmin" on public.clinics
  for select using (public.is_superadmin(auth.uid()));

drop policy if exists "clinics_insert_superadmin" on public.clinics;
create policy "clinics_insert_superadmin" on public.clinics
  for insert with check (public.is_superadmin(auth.uid()));

drop policy if exists "clinics_update_superadmin" on public.clinics;
create policy "clinics_update_superadmin" on public.clinics
  for update using (public.is_superadmin(auth.uid()));

-- ---------- profiles: scope the existing policies to the caller's own clinic ----------
drop policy if exists "profiles_select_active_sellers" on public.profiles;
create policy "profiles_select_active_sellers" on public.profiles
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "profiles_select_superadmin" on public.profiles;
create policy "profiles_select_superadmin" on public.profiles
  for select using (public.is_superadmin(auth.uid()));

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (
    auth.uid() = id or (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id())
  )
  with check (
    auth.uid() = id or (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id())
  );

-- ---------- patients: same policies, now clinic-scoped ----------
drop policy if exists "patients_select_active_sellers" on public.patients;
create policy "patients_select_active_sellers" on public.patients
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "patients_insert_self" on public.patients;
create policy "patients_insert_self" on public.patients
  for insert with check (
    responsible_seller_id = auth.uid()
    and public.is_active_profile(auth.uid())
    and clinic_id = public.my_clinic_id()
  );

drop policy if exists "patients_update_active_sellers" on public.patients;
create policy "patients_update_active_sellers" on public.patients
  for update using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())
  with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "patients_delete_owner_or_admin" on public.patients;
create policy "patients_delete_owner_or_admin" on public.patients
  for delete using (
    clinic_id = public.my_clinic_id()
    and (responsible_seller_id = auth.uid() or public.is_admin(auth.uid()))
  );

-- reassigning a patient can never hand it to a seller in a different clinic
create or replace function public.guard_patient_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_seller_id is distinct from old.responsible_seller_id then
    if not (auth.uid() = old.responsible_seller_id or public.is_admin(auth.uid())) then
      raise exception 'Only the responsible seller or an admin can reassign this patient';
    end if;
    if not exists (
      select 1 from public.profiles
      where id = new.responsible_seller_id and clinic_id = old.clinic_id
    ) then
      raise exception 'Cannot reassign a patient to a seller outside this clinic';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- patient_visits: same policies, now clinic-scoped ----------
drop policy if exists "patient_visits_select_active_sellers" on public.patient_visits;
create policy "patient_visits_select_active_sellers" on public.patient_visits
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "patient_visits_insert_active_sellers" on public.patient_visits;
create policy "patient_visits_insert_active_sellers" on public.patient_visits
  for insert with check (
    created_by_seller_id = auth.uid()
    and public.is_active_profile(auth.uid())
    and clinic_id = public.my_clinic_id()
  );

drop policy if exists "patient_visits_update_active_sellers" on public.patient_visits;
create policy "patient_visits_update_active_sellers" on public.patient_visits
  for update using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())
  with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "patient_visits_delete_active_sellers" on public.patient_visits;
create policy "patient_visits_delete_active_sellers" on public.patient_visits
  for delete using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

-- ---------- quotes: still private per-seller, now also clinic-scoped ----------
drop policy if exists "quotes_select_own" on public.quotes;
create policy "quotes_select_own" on public.quotes
  for select using (auth.uid() = user_id and clinic_id = public.my_clinic_id());

drop policy if exists "quotes_insert_own" on public.quotes;
create policy "quotes_insert_own" on public.quotes
  for insert with check (auth.uid() = user_id and clinic_id = public.my_clinic_id());

drop policy if exists "quotes_update_own" on public.quotes;
create policy "quotes_update_own" on public.quotes
  for update using (auth.uid() = user_id and clinic_id = public.my_clinic_id())
  with check (auth.uid() = user_id and clinic_id = public.my_clinic_id());

drop policy if exists "quotes_delete_own" on public.quotes;
create policy "quotes_delete_own" on public.quotes
  for delete using (auth.uid() = user_id and clinic_id = public.my_clinic_id());

-- ---------- tasks: still private per-seller, now also clinic-scoped ----------
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id and clinic_id = public.my_clinic_id());

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id and clinic_id = public.my_clinic_id());

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id and clinic_id = public.my_clinic_id())
  with check (auth.uid() = user_id and clinic_id = public.my_clinic_id());

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id and clinic_id = public.my_clinic_id());

-- ---------- settings: own-row policies are already safe; only the admin cross-seller
-- read was a cross-clinic leak under multi-tenancy — fix that one ----------
drop policy if exists "settings_select_admin" on public.settings;
create policy "settings_select_admin" on public.settings
  for select using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id());

-- ---------- clinic_config: singleton row -> one row per clinic ----------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clinic_config' and column_name = 'id'
      and data_type = 'boolean'
  ) then
    alter table public.clinic_config add column if not exists clinic_id uuid references public.clinics(id);
    update public.clinic_config set clinic_id = (select id from public.clinics order by created_at asc limit 1)
      where clinic_id is null;
    alter table public.clinic_config alter column clinic_id set not null;
    alter table public.clinic_config drop constraint if exists clinic_config_pkey;
    alter table public.clinic_config drop column if exists id;
    alter table public.clinic_config add primary key (clinic_id);
  end if;
end $$;

drop policy if exists "clinic_config_select_admin" on public.clinic_config;
drop policy if exists "clinic_config_select_active" on public.clinic_config;
create policy "clinic_config_select_active" on public.clinic_config
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "clinic_config_update_admin" on public.clinic_config;
create policy "clinic_config_update_admin" on public.clinic_config
  for update using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "clinic_config_insert_admin" on public.clinic_config;
create policy "clinic_config_insert_admin" on public.clinic_config
  for insert with check (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id());

-- ---------- activity_log: the existing admin read was also a cross-clinic leak ----------
-- Deliberately no superadmin read policy here yet: entries can name a patient (e.g.
-- "added patient John Smith"), which would cross the "aggregates only, no patient PII"
-- boundary for the superadmin platform area. Phase 3 adds either a redacted view or a
-- counts-only RPC instead of relaxing this policy.
drop policy if exists "activity_log_select_admin" on public.activity_log;
create policy "activity_log_select_admin" on public.activity_log
  for select using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id());

-- =====================================================================
-- MULTI-TENANT MIGRATION — Phase 1 follow-up fixes + Phase 3 (superadmin platform)
-- support. Idempotent/safe to re-run.
-- =====================================================================

-- ---------- clinic_id on insert ----------
-- Phase 1 made clinic_id NOT NULL on every clinic-scoped table but nothing ever filled it
-- in: the app's inserts don't pass it, and there was no default. Every patient/quote/task/
-- visit/settings/link-code insert failed, and activity_log rows landed with a null
-- clinic_id (invisible to the clinic's own admin feed). Filled in by trigger rather than
-- by threading clinic_id through every insert in the app:
--   * a signed-in caller's rows always belong to their own clinic — forced, not
--     defaulted, so a caller can't write into another clinic by passing clinic_id
--     explicitly (RLS already blocks that on most tables, but not activity_log);
--   * service-role writes (no auth.uid()) keep whatever clinic_id they pass, else derive
--     it from the row's owner — e.g. the auto "book visit 2" task, which the service-role
--     client inserts on behalf of the patient's responsible seller.
create or replace function public.set_row_clinic_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if auth.uid() is not null then
    new.clinic_id := public.my_clinic_id();
  elsif new.clinic_id is null and tg_nargs > 0 then
    owner_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
    if tg_table_name = 'patient_visits' then
      select clinic_id into new.clinic_id from public.patients where id = owner_id;
    else
      select clinic_id into new.clinic_id from public.profiles where id = owner_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_set_clinic_id on public.patients;
create trigger patients_set_clinic_id before insert on public.patients
  for each row execute function public.set_row_clinic_id('responsible_seller_id');

drop trigger if exists patient_visits_set_clinic_id on public.patient_visits;
create trigger patient_visits_set_clinic_id before insert on public.patient_visits
  for each row execute function public.set_row_clinic_id('patient_id');

drop trigger if exists quotes_set_clinic_id on public.quotes;
create trigger quotes_set_clinic_id before insert on public.quotes
  for each row execute function public.set_row_clinic_id('user_id');

drop trigger if exists tasks_set_clinic_id on public.tasks;
create trigger tasks_set_clinic_id before insert on public.tasks
  for each row execute function public.set_row_clinic_id('user_id');

drop trigger if exists settings_set_clinic_id on public.settings;
create trigger settings_set_clinic_id before insert on public.settings
  for each row execute function public.set_row_clinic_id('user_id');

drop trigger if exists telegram_link_codes_set_clinic_id on public.telegram_link_codes;
create trigger telegram_link_codes_set_clinic_id before insert on public.telegram_link_codes
  for each row execute function public.set_row_clinic_id('user_id');

drop trigger if exists activity_log_set_clinic_id on public.activity_log;
create trigger activity_log_set_clinic_id before insert on public.activity_log
  for each row execute function public.set_row_clinic_id('actor_id');

-- ---------- profile privilege guard: let the service role provision accounts ----------
-- The Phase 1 version rejected *every* clinic_id change, and every role change without an
-- admin auth.uid() — including the service-role client assigning a brand-new account
-- (clinic_id still null from handle_new_user()) to its clinic. That broke addSeller, and
-- would break creating a clinic's first admin from the platform area. No auth.uid() means
-- the service role or a direct DB connection — both trusted, and neither reachable by an
-- ordinary signed-in user (RLS never lets a JWT-less request update profiles). clinic_id
-- still can't be *moved* between clinics by anyone, only assigned once.
create or replace function public.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if old.clinic_id is not null and new.clinic_id is distinct from old.clinic_id then
      raise exception 'clinic_id cannot be changed once assigned';
    end if;
    return new;
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can change role or active status';
  end if;
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'clinic_id cannot be changed directly';
  end if;
  return new;
end;
$$;

-- ---------- suspended clinics ----------
-- clinics.is_active = false (set from the platform area) locks out that clinic's whole
-- team at the RLS level: is_active_profile() gates every shared-record policy. A
-- superadmin has no clinic, so the left join leaves them unaffected.
create or replace function public.is_active_profile(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_active and coalesce(c.is_active, true)
     from public.profiles p left join public.clinics c on c.id = p.clinic_id
     where p.id = uid),
    false
  );
$$;

-- =====================================================================
-- PLATFORM: presence (online / last seen). Idempotent/safe to re-run.
-- =====================================================================

-- Its own table rather than a profiles column: a heartbeat every minute would otherwise
-- keep bumping profiles.updated_at and running profiles_guard_privilege on every tick.
-- No RLS policies at all — written only through touch_presence() below, read only by the
-- platform area via the service role.
create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;

-- Called by the app's heartbeat. Throttled here (at most one write per 30s per user), so a
-- burst of calls from several open tabs costs nothing.
create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_presence (user_id, last_seen_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
    where public.user_presence.last_seen_at < now() - interval '30 seconds';
$$;

revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- =====================================================================
-- PLATFORM: monthly usage trends. Idempotent/safe to re-run.
-- =====================================================================

-- One row per clinic per month (zero-filled) for the last p_months months, counts only —
-- nothing identifying crosses into the platform area. Aggregated in SQL because pulling raw
-- rows would hit PostgREST's row cap on any clinic with real history. "Active users" is
-- distinct people who logged any activity that month: the only historical signal there is
-- (user_presence only knows the latest heartbeat). Months are UTC, matching the app's own
-- month keys (currentMonthKey uses toISOString).
create or replace function public.platform_monthly_usage(p_months int default 12)
returns table (clinic_id uuid, month date, quotes_created int, patients_confirmed int, active_users int)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('month', now() at time zone 'utc') - make_interval(months => greatest(p_months, 1) - 1))::date as first_month,
      (date_trunc('month', now() at time zone 'utc') + interval '1 month')::date as end_month
  ),
  months as (
    select generate_series(b.first_month, b.end_month - 1, interval '1 month')::date as month from bounds b
  ),
  q as (
    select t.clinic_id, date_trunc('month', t.created_at at time zone 'utc')::date as m, count(*) as n
    from public.quotes t, bounds b
    where t.created_at >= b.first_month and t.created_at < b.end_month
    group by 1, 2
  ),
  p as (
    select t.clinic_id, date_trunc('month', t.confirmation_date)::date as m, count(*) as n
    from public.patients t, bounds b
    where t.confirmation_date >= b.first_month and t.confirmation_date < b.end_month
    group by 1, 2
  ),
  a as (
    select t.clinic_id, date_trunc('month', t.created_at at time zone 'utc')::date as m, count(distinct t.actor_id) as n
    from public.activity_log t, bounds b
    where t.clinic_id is not null and t.created_at >= b.first_month and t.created_at < b.end_month
    group by 1, 2
  )
  select c.id, mo.month, coalesce(q.n, 0)::int, coalesce(p.n, 0)::int, coalesce(a.n, 0)::int
  from public.clinics c
  cross join months mo
  left join q on q.clinic_id = c.id and q.m = mo.month
  left join p on p.clinic_id = c.id and p.m = mo.month
  left join a on a.clinic_id = c.id and a.m = mo.month
  order by c.id, mo.month;
$$;

-- Service role only: this spans every clinic, so it's for the platform area's server code
-- (behind requireSuperadmin), never for a signed-in user calling it directly.
revoke all on function public.platform_monthly_usage(int) from public, anon, authenticated;
grant execute on function public.platform_monthly_usage(int) to service_role;

-- =====================================================================
-- PLATFORM: per-clinic plan & billing record. Idempotent/safe to re-run.
-- =====================================================================

-- Its own table rather than columns on clinics: clinics is readable by the clinic's own
-- staff (clinics_select_own), and a clinic mustn't see its price or the platform's private
-- notes about it. RLS on with no policies = service role only. No row = no plan set yet.
-- Record-keeping only — no payments happen here.
create table if not exists public.clinic_billing (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'pro', 'custom')),
  -- max active accounts (admins + sellers); null = unlimited
  seat_limit int check (seat_limit is null or seat_limit > 0),
  trial_ends_at date,
  monthly_price numeric(10, 2) check (monthly_price is null or monthly_price >= 0),
  currency text not null default 'EUR' check (currency in ('GBP', 'USD', 'EUR', 'TRY')),
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.clinic_billing enable row level security;

drop trigger if exists clinic_billing_set_updated_at on public.clinic_billing;
create trigger clinic_billing_set_updated_at
  before update on public.clinic_billing
  for each row execute function public.set_updated_at();

-- =====================================================================
-- PLATFORM: announcements (banner at the top of the clinic app). Idempotent/safe to re-run.
-- =====================================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(trim(message)) between 1 and 500),
  level text not null default 'info' check (level in ('info', 'warning', 'critical')),
  -- null = every clinic; otherwise only these
  clinic_ids uuid[] check (clinic_ids is null or cardinality(clinic_ids) > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

alter table public.announcements enable row level security;

-- Clinic staff read only what's live right now and aimed at their clinic — the targeting
-- happens here, so the app can simply select everything it's allowed to see. No write
-- policies: announcements are created and ended by the platform area via the service role.
drop policy if exists "announcements_select_live_for_my_clinic" on public.announcements;
create policy "announcements_select_live_for_my_clinic" on public.announcements
  for select using (
    public.is_active_profile(auth.uid())
    and public.my_clinic_id() is not null
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (clinic_ids is null or public.my_clinic_id() = any(clinic_ids))
  );

-- =====================================================================
-- PLATFORM: scheduled job runs, for the system status page. Idempotent/safe to re-run.
-- =====================================================================

-- One row per cron run (written by the route wrapper in src/lib/job-runs.ts), so a job
-- that stops running or starts failing is visible instead of silent. RLS on with no
-- policies = service role only. Old rows are pruned by the wrapper (30 days).
create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  status_code int,
  summary text,
  error text
);

create index if not exists job_runs_job_started_idx on public.job_runs (job, started_at desc);

alter table public.job_runs enable row level security;

-- =====================================================================
-- PLATFORM: terms of service / DPA acceptance. Idempotent/safe to re-run.
-- =====================================================================

-- One row per acceptance: which clinic, which admin, which version, in which language.
-- Evidence that the clinic agreed to the processing terms (incl. support access): clinics
-- get no update/delete policies at all, and the trigger below refuses edits even from the
-- service role. Rows go away only with their clinic (cascade).
create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  version text not null,
  language text not null check (language in ('tr', 'en')),
  accepted_at timestamptz not null default now()
);

create index if not exists terms_acceptances_clinic_idx on public.terms_acceptances (clinic_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

-- clinic_id is forced to the caller's own clinic by set_row_clinic_id()
drop trigger if exists terms_acceptances_set_clinic_id on public.terms_acceptances;
create trigger terms_acceptances_set_clinic_id before insert on public.terms_acceptances
  for each row execute function public.set_row_clinic_id('user_id');

-- Only a clinic's active admin accepts, only as themselves, only for their own clinic.
drop policy if exists "terms_acceptances_insert_admin" on public.terms_acceptances;
create policy "terms_acceptances_insert_admin" on public.terms_acceptances
  for insert with check (
    user_id = auth.uid()
    and public.is_admin(auth.uid())
    and public.is_active_profile(auth.uid())
    and clinic_id = public.my_clinic_id()
  );

-- A clinic's admins can see their own clinic's acceptances (the app checks the current version).
drop policy if exists "terms_acceptances_select_own_clinic_admin" on public.terms_acceptances;
create policy "terms_acceptances_select_own_clinic_admin" on public.terms_acceptances
  for select using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id());

create or replace function public.forbid_row_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are append-only', tg_table_name;
end;
$$;

-- No edits, even from the service role: an edited acceptance record proves nothing.
drop trigger if exists terms_acceptances_append_only on public.terms_acceptances;
create trigger terms_acceptances_append_only before update on public.terms_acceptances
  for each row execute function public.forbid_row_change();

-- =====================================================================
-- PLATFORM: support mode — a superadmin working inside one clinic. Idempotent/safe to re-run.
-- =====================================================================
-- Model: the superadmin keeps their own identity (never a member of the clinic, never in its
-- team list) and, while a session is open, the database treats them as an admin of that one
-- clinic. Every existing clinic-scoped policy keys off my_clinic_id()/is_admin(), so extending
-- those two helpers is what grants access — no per-table rewrite. Writes stay impossible
-- until editing is explicitly unlocked (restrictive policies below). Sessions are created,
-- extended and ended only by the platform area through the service role.

create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  superadmin_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  -- whose view the clinic app renders (their "me": dashboard, quotes, tasks, role)
  view_as_user_id uuid references auth.users(id) on delete set null,
  note text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- writes allowed only while this is in the future
  editing_until timestamptz,
  ended_at timestamptz
);

create index if not exists support_sessions_superadmin_idx on public.support_sessions (superadmin_id, started_at desc);
create index if not exists support_sessions_clinic_idx on public.support_sessions (clinic_id, started_at desc);

alter table public.support_sessions enable row level security;

-- The clinic of the caller's open support session — only for a superadmin whose current
-- login passed two-factor (aal2), so a stolen password alone can never open a clinic.
create or replace function public.support_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.clinic_id
  from public.support_sessions s
  where s.superadmin_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now()
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and public.is_superadmin(auth.uid())
  order by s.started_at desc
  limit 1;
$$;

-- True only while the caller's open session has editing unlocked.
create or replace function public.support_can_write()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.support_sessions s
    where s.superadmin_id = auth.uid()
      and s.ended_at is null
      and s.expires_at > now()
      and s.editing_until > now()
      and s.clinic_id = public.support_clinic_id()
  );
$$;

-- A clinic member's own clinic, or — for a superadmin in support mode — the supported clinic.
create or replace function public.my_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select clinic_id from public.profiles where id = auth.uid()), public.support_clinic_id());
$$;

-- Admin of their clinic, or a superadmin acting in support mode (only ever for the caller
-- themselves — support never makes *another* user an admin).
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false)
      or (uid = auth.uid() and public.is_superadmin(uid) and public.support_clinic_id() is not null);
$$;

-- Quotes, tasks and settings are private per seller (own-row policies), and new patients /
-- visits must be owned by the inserting user. Support works on behalf of whichever member
-- it's viewing as, so it gets clinic-wide policies on these — still limited to the one
-- supported clinic, and still read-only until unlocked (restrictive policies below).
do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'tasks', 'settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_support_select', t);
    execute format('create policy %I on public.%I for select using (clinic_id = public.support_clinic_id())', t || '_support_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_support_update', t);
    execute format('create policy %I on public.%I for update using (clinic_id = public.support_clinic_id()) with check (clinic_id = public.support_clinic_id())', t || '_support_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_support_delete', t);
    execute format('create policy %I on public.%I for delete using (clinic_id = public.support_clinic_id())', t || '_support_delete', t);
  end loop;
  foreach t in array array['quotes', 'tasks', 'settings', 'patients', 'patient_visits'] loop
    execute format('drop policy if exists %I on public.%I', t || '_support_insert', t);
    execute format('create policy %I on public.%I for insert with check (clinic_id = public.support_clinic_id())', t || '_support_insert', t);
  end loop;
end $$;

-- Read-only until unlocked: RESTRICTIVE policies are ANDed with every permissive one, so a
-- superadmin's insert/update/delete on clinic data fails unless editing is unlocked right
-- now. For everyone else `not is_superadmin(...)` is true and nothing changes.
do $$
declare
  t text;
begin
  foreach t in array array['patients', 'patient_visits', 'quotes', 'tasks', 'settings', 'profiles', 'clinic_config'] loop
    execute format('drop policy if exists %I on public.%I', t || '_support_readonly_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write())',
      t || '_support_readonly_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_support_readonly_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write()) with check (not public.is_superadmin(auth.uid()) or public.support_can_write())',
      t || '_support_readonly_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_support_readonly_delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write())',
      t || '_support_readonly_delete', t);
  end loop;
end $$;

-- Things support must never do on a clinic's behalf, unlocked or not: accept its terms, or
-- link its members' Telegram.
drop policy if exists "terms_acceptances_no_support" on public.terms_acceptances;
create policy "terms_acceptances_no_support" on public.terms_acceptances
  as restrictive for insert with check (not public.is_superadmin(auth.uid()));

drop policy if exists "telegram_link_codes_no_support" on public.telegram_link_codes;
create policy "telegram_link_codes_no_support" on public.telegram_link_codes
  as restrictive for insert with check (not public.is_superadmin(auth.uid()));

-- Support's changes show in the clinic's own history as "DentalSeller support" rather than
-- as an unknown actor — marked here, where it can't be forgotten by any code path.
alter table public.activity_log add column if not exists via_support boolean not null default false;

create or replace function public.mark_support_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.via_support := auth.uid() is not null and public.is_superadmin(auth.uid());
  return new;
end;
$$;

drop trigger if exists activity_log_mark_support on public.activity_log;
create trigger activity_log_mark_support before insert on public.activity_log
  for each row execute function public.mark_support_activity();

-- Support's own actions aren't the clinic's usage: redefine the usage trends (first defined
-- above, before via_support existed) so a support visit never counts as an active team
-- member — it would inflate the numbers and mask an inactive clinic.
create or replace function public.platform_monthly_usage(p_months int default 12)
returns table (clinic_id uuid, month date, quotes_created int, patients_confirmed int, active_users int)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('month', now() at time zone 'utc') - make_interval(months => greatest(p_months, 1) - 1))::date as first_month,
      (date_trunc('month', now() at time zone 'utc') + interval '1 month')::date as end_month
  ),
  months as (
    select generate_series(b.first_month, b.end_month - 1, interval '1 month')::date as month from bounds b
  ),
  q as (
    select t.clinic_id, date_trunc('month', t.created_at at time zone 'utc')::date as m, count(*) as n
    from public.quotes t, bounds b
    where t.created_at >= b.first_month and t.created_at < b.end_month
    group by 1, 2
  ),
  p as (
    select t.clinic_id, date_trunc('month', t.confirmation_date)::date as m, count(*) as n
    from public.patients t, bounds b
    where t.confirmation_date >= b.first_month and t.confirmation_date < b.end_month
    group by 1, 2
  ),
  a as (
    select t.clinic_id, date_trunc('month', t.created_at at time zone 'utc')::date as m, count(distinct t.actor_id) as n
    from public.activity_log t, bounds b
    where t.clinic_id is not null and not t.via_support
      and t.created_at >= b.first_month and t.created_at < b.end_month
    group by 1, 2
  )
  select c.id, mo.month, coalesce(q.n, 0)::int, coalesce(p.n, 0)::int, coalesce(a.n, 0)::int
  from public.clinics c
  cross join months mo
  left join q on q.clinic_id = c.id and q.m = mo.month
  left join p on p.clinic_id = c.id and p.m = mo.month
  left join a on a.clinic_id = c.id and a.m = mo.month
  order by c.id, mo.month;
$$;

revoke all on function public.platform_monthly_usage(int) from public, anon, authenticated;
grant execute on function public.platform_monthly_usage(int) to service_role;

-- =====================================================================
-- PLATFORM: support access log — tamper-evident. Idempotent/safe to re-run.
-- =====================================================================
-- Everything support does inside a clinic, kept as evidence that access stayed within the
-- terms: session start/end, editing unlocked/locked, view-as changes, pages opened, patient
-- histories viewed. No patient data — page paths and record references only. (The changes
-- themselves are in activity_log with via_support = true.)
--
-- Tamper-evident: each row's hash covers its own content plus the previous row's hash, so
-- editing, deleting or inserting a row anywhere breaks the chain from that point on —
-- verify_support_access_log() recomputes it. Rows can't be updated or deleted at all, even
-- by the service role, and there's no foreign key to clinics: the log outlives the clinic.
create table if not exists public.support_access_log (
  id bigint generated always as identity primary key,
  session_id uuid,
  superadmin_id uuid not null,
  clinic_id uuid,
  event text not null check (event in (
    'session_started', 'session_ended', 'session_extended',
    'editing_unlocked', 'editing_locked', 'view_as_changed',
    'page_viewed', 'record_history_viewed', 'change_made'
  )),
  path text,
  detail text,
  created_at timestamptz not null default clock_timestamp(),
  prev_hash text,
  hash text
);

create index if not exists support_access_log_clinic_idx on public.support_access_log (clinic_id, created_at desc);
create index if not exists support_access_log_session_idx on public.support_access_log (session_id, id);

alter table public.support_access_log enable row level security;

-- The content a row's hash covers — shared by the insert trigger and the verifier so the
-- two can never disagree about the format.
create or replace function public.support_log_row_digest(
  p_prev_hash text, p_id bigint, p_session_id uuid, p_superadmin_id uuid, p_clinic_id uuid,
  p_event text, p_path text, p_detail text, p_created_at timestamptz
)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      concat_ws('|', coalesce(p_prev_hash, 'genesis'), p_id::text, coalesce(p_session_id::text, ''),
        p_superadmin_id::text, coalesce(p_clinic_id::text, ''), p_event, coalesce(p_path, ''),
        coalesce(p_detail, ''), to_char(p_created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US')),
      'sha256'),
    'hex');
$$;

create or replace function public.chain_support_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_hash text;
begin
  -- one writer at a time, so two concurrent inserts can't both chain off the same row
  perform pg_advisory_xact_lock(hashtext('support_access_log_chain'));
  select l.hash into last_hash from public.support_access_log l order by l.id desc limit 1;
  new.prev_hash := last_hash;
  new.hash := public.support_log_row_digest(last_hash, new.id, new.session_id, new.superadmin_id,
    new.clinic_id, new.event, new.path, new.detail, new.created_at);
  return new;
end;
$$;

drop trigger if exists support_access_log_chain on public.support_access_log;
create trigger support_access_log_chain before insert on public.support_access_log
  for each row execute function public.chain_support_log_row();

drop trigger if exists support_access_log_no_update on public.support_access_log;
create trigger support_access_log_no_update before update on public.support_access_log
  for each row execute function public.forbid_row_change();

drop trigger if exists support_access_log_no_delete on public.support_access_log;
create trigger support_access_log_no_delete before delete on public.support_access_log
  for each row execute function public.forbid_row_change();

-- Recomputes the whole chain. Returns the first row whose stored hash or link doesn't match
-- (null broken_id = intact), plus how many rows were checked.
create or replace function public.verify_support_access_log()
returns table (checked bigint, broken_id bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  expected_prev text := null;
  n bigint := 0;
begin
  for r in select * from public.support_access_log order by id loop
    n := n + 1;
    if r.prev_hash is distinct from expected_prev
       or r.hash is distinct from public.support_log_row_digest(r.prev_hash, r.id, r.session_id,
            r.superadmin_id, r.clinic_id, r.event, r.path, r.detail, r.created_at) then
      checked := n;
      broken_id := r.id;
      return next;
      return;
    end if;
    expected_prev := r.hash;
  end loop;
  checked := n;
  broken_id := null;
  return next;
end;
$$;

revoke all on function public.verify_support_access_log() from public, anon, authenticated;
grant execute on function public.verify_support_access_log() to service_role;

-- Every change support makes also lands in the chained log (action + record reference only;
-- the values stay in the clinic's own history), so views and changes are covered alike.
create or replace function public.log_support_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.via_support then
    insert into public.support_access_log (session_id, superadmin_id, clinic_id, event, detail)
    select
      (select s.id from public.support_sessions s
        where s.superadmin_id = new.actor_id and s.ended_at is null
        order by s.started_at desc limit 1),
      new.actor_id,
      new.clinic_id,
      'change_made',
      concat_ws(' ', new.action,
        case when new.target_id is not null and new.target_type in ('patient', 'quote', 'task')
          then '#' || upper(left(new.target_type, 1)) || '-' || upper(left(replace(new.target_id, '-', ''), 4))
        end);
  end if;
  return new;
end;
$$;

drop trigger if exists activity_log_support_change on public.activity_log;
create trigger activity_log_support_change after insert on public.activity_log
  for each row execute function public.log_support_change();

-- ---------- system settings (clinic-wide, admin-only — Settings → System) ----------
-- Whether hotel/external-transfer costs are deducted from a visit's amount before commission
-- is worked out. Off by default: some clinics pay commission on the full amount.
alter table public.clinic_config add column if not exists deduct_costs_from_commission boolean not null default false;
-- The optional surcharge added to a card payment (e.g. 0.03 = 3%). Never counts toward commission.
alter table public.clinic_config add column if not exists card_surcharge_rate numeric(5,4) not null default 0.03
  check (card_surcharge_rate >= 0 and card_surcharge_rate <= 1);

-- ---------- patient phone + pax (people travelling, patient included) per visit ----------
-- Pax is per visit: the same for every transfer of that visit, but visit 2 can differ.
alter table public.patients add column if not exists phone text;
alter table public.patients add column if not exists visit1_pax integer not null default 1 check (visit1_pax between 1 and 50);
alter table public.patients add column if not exists visit2_pax integer not null default 1 check (visit2_pax between 1 and 50);
alter table public.patient_visits add column if not exists pax integer not null default 1 check (pax between 1 and 50);

-- ---------- transfer companies + drivers ----------
-- Airport transfers go through external companies; hotel<->clinic runs use the clinic's own
-- car and drivers. Both live here: the clinic itself is one "internal" company (exactly one
-- per clinic, created automatically), external companies sit alongside it, and every driver
-- belongs to one company. Internal transfers never cost anything; external ones can.
create table if not exists public.transfer_companies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  is_internal boolean not null default false,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transfer_companies_one_internal
  on public.transfer_companies (clinic_id) where is_internal;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  company_id uuid not null references public.transfer_companies(id) on delete cascade,
  name text not null,
  phone text,
  vehicle text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drivers_company_idx on public.drivers (company_id);

drop trigger if exists transfer_companies_set_updated_at on public.transfer_companies;
create trigger transfer_companies_set_updated_at before update on public.transfer_companies
  for each row execute function public.set_updated_at();
drop trigger if exists drivers_set_updated_at on public.drivers;
create trigger drivers_set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

drop trigger if exists transfer_companies_set_clinic_id on public.transfer_companies;
create trigger transfer_companies_set_clinic_id before insert on public.transfer_companies
  for each row execute function public.set_row_clinic_id();
drop trigger if exists drivers_set_clinic_id on public.drivers;
create trigger drivers_set_clinic_id before insert on public.drivers
  for each row execute function public.set_row_clinic_id();

-- a driver must belong to a company of the same clinic. Named so it sorts after
-- drivers_set_clinic_id — Postgres fires BEFORE triggers alphabetically, and this needs clinic_id set.
create or replace function public.check_driver_company_clinic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.transfer_companies where id = new.company_id and clinic_id = new.clinic_id) then
    raise exception 'Company not found';
  end if;
  return new;
end;
$$;
drop trigger if exists drivers_check_company_clinic on public.drivers;
drop trigger if exists drivers_validate_company on public.drivers;
create trigger drivers_validate_company before insert or update on public.drivers
  for each row execute function public.check_driver_company_clinic();

-- the internal company can't be renamed into an external one or vice versa
create or replace function public.guard_transfer_company_internal()
returns trigger
language plpgsql
as $$
begin
  if new.is_internal is distinct from old.is_internal then
    raise exception 'A company can''t switch between internal and external';
  end if;
  return new;
end;
$$;
drop trigger if exists transfer_companies_guard_internal on public.transfer_companies;
create trigger transfer_companies_guard_internal before update on public.transfer_companies
  for each row execute function public.guard_transfer_company_internal();

-- every clinic gets its internal company — existing ones now, new ones at creation
insert into public.transfer_companies (clinic_id, name, is_internal)
select c.id, c.name, true from public.clinics c
where not exists (select 1 from public.transfer_companies t where t.clinic_id = c.id and t.is_internal);

create or replace function public.create_internal_transfer_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.transfer_companies (clinic_id, name, is_internal) values (new.id, new.name, true);
  return new;
end;
$$;
drop trigger if exists clinics_create_internal_transfer_company on public.clinics;
create trigger clinics_create_internal_transfer_company after insert on public.clinics
  for each row execute function public.create_internal_transfer_company();

alter table public.transfer_companies enable row level security;
alter table public.drivers enable row level security;

-- Any active member works with the list (operations is done by sellers today); only an admin
-- deletes — deactivating is the everyday way to retire a driver or company.
do $$
declare
  t text;
begin
  foreach t in array array['transfer_companies', 'drivers'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_active', t);
    execute format('create policy %I on public.%I for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())', t || '_select_active', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_active', t);
    execute format('create policy %I on public.%I for insert with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())', t || '_insert_active', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_active', t);
    execute format('create policy %I on public.%I for update using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id()) with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())', t || '_update_active', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);
    execute format('create policy %I on public.%I for delete using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id())', t || '_delete_admin', t);
    -- support mode: read-only until unlocked, same as every other clinic table
    execute format('drop policy if exists %I on public.%I', t || '_support_readonly_insert', t);
    execute format('create policy %I on public.%I as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write())', t || '_support_readonly_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_support_readonly_update', t);
    execute format('create policy %I on public.%I as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write()) with check (not public.is_superadmin(auth.uid()) or public.support_can_write())', t || '_support_readonly_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_support_readonly_delete', t);
    execute format('create policy %I on public.%I as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write())', t || '_support_readonly_delete', t);
  end loop;
end $$;

-- ---------- transfers (one row per car journey, per visit) ----------
-- A visit is visit 1/2 of the patient row (visit_number) or an extra visit (extra_visit_id).
-- kind: arrival = airport pickup, departure = airport drop-off, local = anything in between
-- (hotel -> clinic and back). Pax defaults from the visit. Cost only ever applies to an
-- external company — an internal (clinic) transfer's cost is forced to null.
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_number smallint check (visit_number in (1, 2)),
  extra_visit_id uuid references public.patient_visits(id) on delete cascade,
  kind text not null default 'local' check (kind in ('arrival', 'departure', 'local')),
  transfer_date date,
  transfer_time text,
  from_place text,
  to_place text,
  pax integer not null default 1 check (pax between 1 and 50),
  company_id uuid references public.transfer_companies(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  flight_no text,
  cost numeric(10,2) check (cost is null or cost >= 0),
  status text not null default 'planned' check (status in ('planned', 'sent', 'done')),
  sent_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visit_number is not null) <> (extra_visit_id is not null))
);
create index if not exists transfers_patient_idx on public.transfers (patient_id);
create index if not exists transfers_date_idx on public.transfers (clinic_id, transfer_date);

drop trigger if exists transfers_set_updated_at on public.transfers;
create trigger transfers_set_updated_at before update on public.transfers
  for each row execute function public.set_updated_at();

drop trigger if exists transfers_set_clinic_id on public.transfers;
create trigger transfers_set_clinic_id before insert on public.transfers
  for each row execute function public.set_row_clinic_id();

-- Everything a transfer points at must be in its own clinic, the driver must work for the
-- chosen company, and an internal transfer never costs anything. Sorts after
-- transfers_set_clinic_id (BEFORE triggers fire alphabetically) so clinic_id is set.
create or replace function public.validate_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company_internal boolean;
begin
  if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id) then
    raise exception 'Patient not found';
  end if;
  if new.extra_visit_id is not null
     and not exists (select 1 from public.patient_visits where id = new.extra_visit_id and patient_id = new.patient_id) then
    raise exception 'Visit not found';
  end if;
  if new.company_id is not null then
    select is_internal into company_internal from public.transfer_companies
      where id = new.company_id and clinic_id = new.clinic_id;
    if not found then raise exception 'Company not found'; end if;
    if company_internal then new.cost := null; end if;
  else
    new.cost := null;
  end if;
  if new.driver_id is not null
     and not exists (select 1 from public.drivers where id = new.driver_id and company_id = new.company_id) then
    raise exception 'That driver does not work for the chosen company';
  end if;
  return new;
end;
$$;
drop trigger if exists transfers_validate on public.transfers;
create trigger transfers_validate before insert or update on public.transfers
  for each row execute function public.validate_transfer();

-- The old "arrival/departure transfer arranged" flags on patients / patient_visits are now
-- derived: arranged = that visit has an arrival (or departure) transfer with a driver. Kept as
-- columns so the dashboard and reminder job read them unchanged; only this trigger writes them.
create or replace function public.sync_transfer_flags(p_patient uuid, p_visit smallint, p_extra uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  arr boolean;
  dep boolean;
begin
  select
    coalesce(bool_or(kind = 'arrival' and driver_id is not null), false),
    coalesce(bool_or(kind = 'departure' and driver_id is not null), false)
  into arr, dep
  from public.transfers
  where patient_id = p_patient
    and visit_number is not distinct from p_visit
    and extra_visit_id is not distinct from p_extra;

  if p_extra is not null then
    update public.patient_visits
      set arrival_transfer_arranged = arr, departure_transfer_arranged = dep
      where id = p_extra and (arrival_transfer_arranged, departure_transfer_arranged) is distinct from (arr, dep);
  elsif p_visit = 1 then
    update public.patients
      set visit1_arrival_transfer_arranged = arr, visit1_departure_transfer_arranged = dep
      where id = p_patient and (visit1_arrival_transfer_arranged, visit1_departure_transfer_arranged) is distinct from (arr, dep);
  elsif p_visit = 2 then
    update public.patients
      set visit2_arrival_transfer_arranged = arr, visit2_departure_transfer_arranged = dep
      where id = p_patient and (visit2_arrival_transfer_arranged, visit2_departure_transfer_arranged) is distinct from (arr, dep);
  end if;
end;
$$;

create or replace function public.transfers_sync_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_transfer_flags(old.patient_id, old.visit_number, old.extra_visit_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_transfer_flags(new.patient_id, new.visit_number, new.extra_visit_id);
  end if;
  return null;
end;
$$;
drop trigger if exists transfers_sync_flags on public.transfers;
create trigger transfers_sync_flags after insert or update or delete on public.transfers
  for each row execute function public.transfers_sync_flags();

alter table public.transfers enable row level security;

-- Transfers are part of the shared patient record: any active member reads and edits them
-- (like extra visits); support is read-only until unlocked.
drop policy if exists "transfers_select_active" on public.transfers;
create policy "transfers_select_active" on public.transfers
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "transfers_insert_active" on public.transfers;
create policy "transfers_insert_active" on public.transfers
  for insert with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "transfers_update_active" on public.transfers;
create policy "transfers_update_active" on public.transfers
  for update using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())
  with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "transfers_delete_active" on public.transfers;
create policy "transfers_delete_active" on public.transfers
  for delete using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "transfers_support_readonly_insert" on public.transfers;
create policy "transfers_support_readonly_insert" on public.transfers
  as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "transfers_support_readonly_update" on public.transfers;
create policy "transfers_support_readonly_update" on public.transfers
  as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write())
  with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "transfers_support_readonly_delete" on public.transfers;
create policy "transfers_support_readonly_delete" on public.transfers
  as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write());

-- ---------- extras sold on a visit (extra hotel nights, extra treatments, anything else) ----------
-- Added to what the patient owes for that visit, and they count toward commission exactly like
-- the treatment itself (once paid). Same visit reference as transfers.
create table if not exists public.patient_extras (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_number smallint check (visit_number in (1, 2)),
  extra_visit_id uuid references public.patient_visits(id) on delete cascade,
  kind text not null default 'treatment' check (kind in ('night', 'treatment', 'other')),
  description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  total numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visit_number is not null) <> (extra_visit_id is not null))
);
create index if not exists patient_extras_patient_idx on public.patient_extras (patient_id);

drop trigger if exists patient_extras_set_updated_at on public.patient_extras;
create trigger patient_extras_set_updated_at before update on public.patient_extras
  for each row execute function public.set_updated_at();

drop trigger if exists patient_extras_set_clinic_id on public.patient_extras;
create trigger patient_extras_set_clinic_id before insert on public.patient_extras
  for each row execute function public.set_row_clinic_id();

-- the patient (and extra visit) must be in the row's own clinic. Sorts after set_clinic_id.
create or replace function public.validate_patient_extra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id) then
    raise exception 'Patient not found';
  end if;
  if new.extra_visit_id is not null
     and not exists (select 1 from public.patient_visits where id = new.extra_visit_id and patient_id = new.patient_id) then
    raise exception 'Visit not found';
  end if;
  return new;
end;
$$;
drop trigger if exists patient_extras_validate on public.patient_extras;
create trigger patient_extras_validate before insert or update on public.patient_extras
  for each row execute function public.validate_patient_extra();

alter table public.patient_extras enable row level security;

drop policy if exists "patient_extras_select_active" on public.patient_extras;
create policy "patient_extras_select_active" on public.patient_extras
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "patient_extras_insert_active" on public.patient_extras;
create policy "patient_extras_insert_active" on public.patient_extras
  for insert with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "patient_extras_update_active" on public.patient_extras;
create policy "patient_extras_update_active" on public.patient_extras
  for update using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())
  with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "patient_extras_delete_active" on public.patient_extras;
create policy "patient_extras_delete_active" on public.patient_extras
  for delete using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "patient_extras_support_readonly_insert" on public.patient_extras;
create policy "patient_extras_support_readonly_insert" on public.patient_extras
  as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "patient_extras_support_readonly_update" on public.patient_extras;
create policy "patient_extras_support_readonly_update" on public.patient_extras
  as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write())
  with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "patient_extras_support_readonly_delete" on public.patient_extras;
create policy "patient_extras_support_readonly_delete" on public.patient_extras
  as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write());

-- ---------- payments (pre-accounting: what was actually collected, per visit) ----------
-- `amount` is what counts as treatment revenue. A card payment can carry an optional
-- surcharge (the clinic's card rate, snapshotted at the time) that the patient pays on top —
-- it's recorded separately and never counts toward commission.
create table if not exists public.patient_payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_number smallint check (visit_number in (1, 2)),
  extra_visit_id uuid references public.patient_visits(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'card', 'bank')),
  surcharge_rate numeric(5,4) check (surcharge_rate is null or (surcharge_rate >= 0 and surcharge_rate <= 1)),
  surcharge_amount numeric(10,2) not null default 0 check (surcharge_amount >= 0),
  paid_on date not null default current_date,
  received_by uuid references auth.users(id) on delete set null default auth.uid(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visit_number is not null) <> (extra_visit_id is not null)),
  check (method = 'card' or (surcharge_rate is null and surcharge_amount = 0))
);
create index if not exists patient_payments_patient_idx on public.patient_payments (patient_id);
create index if not exists patient_payments_date_idx on public.patient_payments (clinic_id, paid_on);

drop trigger if exists patient_payments_set_updated_at on public.patient_payments;
create trigger patient_payments_set_updated_at before update on public.patient_payments
  for each row execute function public.set_updated_at();

drop trigger if exists patient_payments_set_clinic_id on public.patient_payments;
create trigger patient_payments_set_clinic_id before insert on public.patient_payments
  for each row execute function public.set_row_clinic_id();

-- Same-clinic checks, and the surcharge is always rate × amount (computed here, not trusted
-- from the client). Sorts after set_clinic_id.
create or replace function public.validate_patient_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id) then
    raise exception 'Patient not found';
  end if;
  if new.extra_visit_id is not null
     and not exists (select 1 from public.patient_visits where id = new.extra_visit_id and patient_id = new.patient_id) then
    raise exception 'Visit not found';
  end if;
  if new.received_by is not null
     and not exists (select 1 from public.profiles where id = new.received_by and clinic_id = new.clinic_id) then
    raise exception 'The person who received it must be on the clinic team';
  end if;
  if new.method = 'card' and new.surcharge_rate is not null then
    new.surcharge_amount := round(new.amount * new.surcharge_rate, 2);
  else
    new.surcharge_rate := null;
    new.surcharge_amount := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists patient_payments_validate on public.patient_payments;
create trigger patient_payments_validate before insert or update on public.patient_payments
  for each row execute function public.validate_patient_payment();

-- A visit's `actual` (visit1_actual / visit2_actual / patient_visits.actual) is now the sum of
-- its payments — null when there are none — kept here so commission, "earned by", Telegram
-- messages and every report keep reading the same column they always have.
create or replace function public.sync_visit_actual(p_patient uuid, p_visit smallint, p_extra uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  paid numeric(10,2);
begin
  select sum(amount) into paid
  from public.patient_payments
  where patient_id = p_patient
    and visit_number is not distinct from p_visit
    and extra_visit_id is not distinct from p_extra;

  if p_extra is not null then
    update public.patient_visits set actual = paid where id = p_extra and actual is distinct from paid;
  elsif p_visit = 1 then
    update public.patients set visit1_actual = paid where id = p_patient and visit1_actual is distinct from paid;
  elsif p_visit = 2 then
    update public.patients set visit2_actual = paid where id = p_patient and visit2_actual is distinct from paid;
  end if;
end;
$$;

create or replace function public.patient_payments_sync_actual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_visit_actual(old.patient_id, old.visit_number, old.extra_visit_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_visit_actual(new.patient_id, new.visit_number, new.extra_visit_id);
  end if;
  return null;
end;
$$;
drop trigger if exists patient_payments_sync_actual on public.patient_payments;
create trigger patient_payments_sync_actual after insert or update or delete on public.patient_payments
  for each row execute function public.patient_payments_sync_actual();

alter table public.patient_payments enable row level security;

drop policy if exists "patient_payments_select_active" on public.patient_payments;
create policy "patient_payments_select_active" on public.patient_payments
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "patient_payments_insert_active" on public.patient_payments;
create policy "patient_payments_insert_active" on public.patient_payments
  for insert with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "patient_payments_update_active" on public.patient_payments;
create policy "patient_payments_update_active" on public.patient_payments
  for update using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id())
  with check (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "patient_payments_delete_active" on public.patient_payments;
create policy "patient_payments_delete_active" on public.patient_payments
  for delete using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

drop policy if exists "patient_payments_support_readonly_insert" on public.patient_payments;
create policy "patient_payments_support_readonly_insert" on public.patient_payments
  as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "patient_payments_support_readonly_update" on public.patient_payments;
create policy "patient_payments_support_readonly_update" on public.patient_payments
  as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write())
  with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "patient_payments_support_readonly_delete" on public.patient_payments;
create policy "patient_payments_support_readonly_delete" on public.patient_payments
  as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write());

-- One-time backfill: every actual typed in before payments existed becomes a single cash
-- payment of the same amount (dated on the visit, received by whoever earned it), so no
-- total or commission changes. Only visits with no payments yet — safe to re-run.
insert into public.patient_payments (clinic_id, patient_id, visit_number, amount, method, paid_on, received_by, note)
select p.clinic_id, p.id, 1, p.visit1_actual, 'cash', coalesce(p.visit1_date, p.created_at::date),
       coalesce(p.visit1_earned_by_seller_id, p.responsible_seller_id), 'Recorded before payments were tracked'
from public.patients p
where p.visit1_actual is not null and p.visit1_actual > 0
  and not exists (select 1 from public.patient_payments x where x.patient_id = p.id and x.visit_number = 1);

insert into public.patient_payments (clinic_id, patient_id, visit_number, amount, method, paid_on, received_by, note)
select p.clinic_id, p.id, 2, p.visit2_actual, 'cash', coalesce(p.visit2_date, p.created_at::date),
       coalesce(p.visit2_earned_by_seller_id, p.responsible_seller_id), 'Recorded before payments were tracked'
from public.patients p
where p.visit2_actual is not null and p.visit2_actual > 0
  and not exists (select 1 from public.patient_payments x where x.patient_id = p.id and x.visit_number = 2);

insert into public.patient_payments (clinic_id, patient_id, extra_visit_id, amount, method, paid_on, received_by, note)
select v.clinic_id, v.patient_id, v.id, v.actual, 'cash', coalesce(v.visit_date, v.created_at::date),
       coalesce(v.earned_by_seller_id, p.responsible_seller_id), 'Recorded before payments were tracked'
from public.patient_visits v join public.patients p on p.id = v.patient_id
where v.actual is not null and v.actual > 0
  and not exists (select 1 from public.patient_payments x where x.extra_visit_id = v.id);

-- ---------- hotel cost per visit ----------
-- What the clinic pays the hotel for the visit (extra nights included). Empty = the patient
-- booked/paid their own hotel. With Settings → System "deduct costs" on, it comes off the
-- visit's amount before commission, together with the visit's external transfer costs.
alter table public.patients add column if not exists visit1_hotel_cost numeric(10,2) check (visit1_hotel_cost is null or visit1_hotel_cost >= 0);
alter table public.patients add column if not exists visit2_hotel_cost numeric(10,2) check (visit2_hotel_cost is null or visit2_hotel_cost >= 0);
alter table public.patient_visits add column if not exists hotel_cost numeric(10,2) check (hotel_cost is null or hotel_cost >= 0);

-- ---------- default transfer company + driver (Settings → Transfers) ----------
-- Airport = arrival/departure transfers, local = hotel <-> clinic. "Suggest transfers" and a
-- new transfer's form start from these. Cleared automatically if the company/driver is deleted.
alter table public.clinic_config add column if not exists default_airport_company_id uuid references public.transfer_companies(id) on delete set null;
alter table public.clinic_config add column if not exists default_airport_driver_id uuid references public.drivers(id) on delete set null;
alter table public.clinic_config add column if not exists default_local_company_id uuid references public.transfer_companies(id) on delete set null;
alter table public.clinic_config add column if not exists default_local_driver_id uuid references public.drivers(id) on delete set null;

-- ---------- driver messages: WhatsApp app / WhatsApp Business API / off ----------
-- How transfer details reach drivers (Settings → Transfers). "app" opens WhatsApp on the
-- user's own device with the message filled in (the original behaviour, so every clinic keeps
-- it); "api" sends from the clinic's WhatsApp Business number through Meta's Cloud API;
-- "off" hides the buttons (copying the message still works).
alter table public.clinic_config add column if not exists driver_messages_mode text not null default 'app';
alter table public.clinic_config drop constraint if exists clinic_config_driver_messages_mode_check;
alter table public.clinic_config add constraint clinic_config_driver_messages_mode_check
  check (driver_messages_mode in ('app', 'api', 'off'));
-- Not secret — identifiers and template names. The token and app secret live in
-- clinic_whatsapp_secrets, which no signed-in user can read.
alter table public.clinic_config add column if not exists whatsapp_phone_number_id text;
alter table public.clinic_config add column if not exists whatsapp_business_account_id text;
alter table public.clinic_config add column if not exists whatsapp_template_single text not null default 'transfer_bildirimi';
alter table public.clinic_config add column if not exists whatsapp_template_day text not null default 'gunluk_transfer_listesi';
alter table public.clinic_config add column if not exists whatsapp_template_lang text not null default 'tr';
alter table public.clinic_config add column if not exists whatsapp_verified_at timestamptz;
alter table public.clinic_config add column if not exists whatsapp_last_error text;
alter table public.clinic_config add column if not exists whatsapp_last_error_at timestamptz;

-- Server-only: RLS on with no policies, so only the service role reads or writes it. The
-- token and app secret are also encrypted by the app (AES-256-GCM) before they're stored.
create table if not exists public.clinic_whatsapp_secrets (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  access_token_enc text,
  app_secret_enc text,
  -- what Meta must echo when the webhook is registered; generated by the app
  webhook_verify_token text,
  updated_at timestamptz not null default now()
);
alter table public.clinic_whatsapp_secrets enable row level security;

-- Delivery status of the last API message about a transfer (a driver's day list shares one
-- message id across its transfers). Null in app mode — there's nothing to track there.
alter table public.transfers add column if not exists wa_message_id text;
alter table public.transfers add column if not exists wa_status text;
alter table public.transfers drop constraint if exists transfers_wa_status_check;
alter table public.transfers add constraint transfers_wa_status_check
  check (wa_status is null or wa_status in ('accepted', 'sent', 'delivered', 'read', 'failed'));
alter table public.transfers add column if not exists wa_status_at timestamptz;
alter table public.transfers add column if not exists wa_error text;
create index if not exists transfers_wa_message_id_idx on public.transfers (wa_message_id) where wa_message_id is not null;

-- =====================================================================
-- SELLERS AS RECORDS, NOT ACCOUNTS (roadmap step A). Idempotent/safe to re-run.
-- =====================================================================
-- A seller is whoever gets credit (and commission) for a sale; an account is whoever logs
-- in. In many clinics sellers never log in — a coordinator enters their patients — so a
-- seller no longer has to be an account.
--
-- Every clinic account has a seller record with the SAME id (kept in sync from profiles
-- below), so every existing responsible_seller_id / earned_by_seller_id value stays valid
-- as-is; only the foreign keys move from auth.users to sellers. A seller without an account
-- is a record with profile_id = null. Linking one to an account later is a merge
-- (merge_sellers) into that account's record.
create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null default public.my_clinic_id() references public.clinics(id) on delete cascade,
  -- For an account's record this mirrors profiles.display_name (null until they first sign in).
  name text,
  profile_id uuid unique references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sellers_account_same_id check (profile_id is null or profile_id = id),
  constraint sellers_named_without_account check (profile_id is not null or nullif(btrim(name), '') is not null)
);

create index if not exists sellers_clinic_id_idx on public.sellers (clinic_id);

drop trigger if exists sellers_set_updated_at on public.sellers;
create trigger sellers_set_updated_at
  before update on public.sellers
  for each row execute function public.set_updated_at();

-- An account that loses its login (deleted) keeps its seller record — patients and earned
-- commission stay with it. It needs a name of its own from then on.
create or replace function public.guard_seller_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is null and nullif(btrim(new.name), '') is null then
    new.name := 'Former account';
  end if;
  -- id / clinic / account link only ever change through the service role, the profile sync
  -- or merge_sellers — never a plain client update
  if auth.uid() is not null
     and coalesce(current_setting('app.seller_merge', true), '') <> 'on'
     and (new.id is distinct from old.id or new.clinic_id is distinct from old.clinic_id
          or new.profile_id is distinct from old.profile_id) then
    raise exception 'A seller''s clinic or account link can''t be changed directly';
  end if;
  return new;
end;
$$;

drop trigger if exists sellers_guard_change on public.sellers;
create trigger sellers_guard_change
  before update on public.sellers
  for each row execute function public.guard_seller_change();

-- ---------- every clinic account has a seller record with its own id ----------
create or replace function public.sync_seller_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinic_id is null or new.role = 'superadmin' then
    return new;
  end if;
  insert into public.sellers (id, clinic_id, name, profile_id, is_active)
  values (new.id, new.clinic_id, new.display_name, new.id, new.is_active)
  on conflict (id) do update
    set name = coalesce(excluded.name, public.sellers.name),
        is_active = excluded.is_active;
  return new;
end;
$$;

drop trigger if exists profiles_sync_seller on public.profiles;
create trigger profiles_sync_seller
  after insert or update of clinic_id, display_name, is_active, role on public.profiles
  for each row execute function public.sync_seller_from_profile();

insert into public.sellers (id, clinic_id, name, profile_id, is_active)
select p.id, p.clinic_id, p.display_name, p.id, p.is_active
from public.profiles p
where p.clinic_id is not null and p.role <> 'superadmin'
on conflict (id) do nothing;

-- A seller id that belongs to the given clinic (for RLS; security definer so policies can
-- ask without re-entering sellers' own RLS).
create or replace function public.is_clinic_seller(sid uuid, cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.sellers where id = sid and clinic_id = cid);
$$;

alter table public.sellers enable row level security;

drop policy if exists "sellers_select_clinic" on public.sellers;
create policy "sellers_select_clinic" on public.sellers
  for select using (public.is_active_profile(auth.uid()) and clinic_id = public.my_clinic_id());

-- Admins manage sellers without an account; accounts' records are owned by the profile sync.
drop policy if exists "sellers_insert_admin" on public.sellers;
create policy "sellers_insert_admin" on public.sellers
  for insert with check (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id() and profile_id is null);

drop policy if exists "sellers_update_admin" on public.sellers;
create policy "sellers_update_admin" on public.sellers
  for update using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id() and profile_id is null)
  with check (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id() and profile_id is null);

-- still refused by the foreign keys while any patient or earned visit points at it
drop policy if exists "sellers_delete_admin" on public.sellers;
create policy "sellers_delete_admin" on public.sellers
  for delete using (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id() and profile_id is null);

drop policy if exists "sellers_support_readonly_insert" on public.sellers;
create policy "sellers_support_readonly_insert" on public.sellers
  as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "sellers_support_readonly_update" on public.sellers;
create policy "sellers_support_readonly_update" on public.sellers
  as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write())
  with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "sellers_support_readonly_delete" on public.sellers;
create policy "sellers_support_readonly_delete" on public.sellers
  as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write());

-- ---------- seller columns point at sellers, not accounts ----------
-- Deleting a seller with patients or earned visits is refused (restrict); deleting an
-- account just unlinks its seller record (profile_id → null) and everything stays put.
alter table public.patients drop constraint if exists patients_user_id_fkey;
alter table public.patients drop constraint if exists patients_responsible_seller_id_fkey;
alter table public.patients add constraint patients_responsible_seller_id_fkey
  foreign key (responsible_seller_id) references public.sellers(id);

alter table public.patients drop constraint if exists patients_visit1_earned_by_seller_id_fkey;
alter table public.patients add constraint patients_visit1_earned_by_seller_id_fkey
  foreign key (visit1_earned_by_seller_id) references public.sellers(id);
alter table public.patients drop constraint if exists patients_visit2_earned_by_seller_id_fkey;
alter table public.patients add constraint patients_visit2_earned_by_seller_id_fkey
  foreign key (visit2_earned_by_seller_id) references public.sellers(id);
alter table public.patient_visits drop constraint if exists patient_visits_earned_by_seller_id_fkey;
alter table public.patient_visits add constraint patient_visits_earned_by_seller_id_fkey
  foreign key (earned_by_seller_id) references public.sellers(id);

-- Commission rates belong to a seller (account or not); an account's own row keeps its
-- personal preferences too, exactly as before.
alter table public.settings drop constraint if exists settings_user_id_fkey;
alter table public.settings add constraint settings_user_id_fkey
  foreign key (user_id) references public.sellers(id) on delete cascade;

-- Admins set the commission rates of sellers without an account (accounts set their own).
drop policy if exists "settings_admin_insert_no_account" on public.settings;
create policy "settings_admin_insert_no_account" on public.settings
  for insert with check (
    public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id()
    and exists (select 1 from public.sellers s where s.id = user_id and s.clinic_id = public.my_clinic_id() and s.profile_id is null)
  );
drop policy if exists "settings_admin_update_no_account" on public.settings;
create policy "settings_admin_update_no_account" on public.settings
  for update using (
    public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id()
    and exists (select 1 from public.sellers s where s.id = user_id and s.clinic_id = public.my_clinic_id() and s.profile_id is null)
  )
  with check (public.is_admin(auth.uid()) and clinic_id = public.my_clinic_id());

-- settings rows inserted by an admin for a no-account seller: clinic from the seller
create or replace function public.set_row_clinic_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if auth.uid() is not null then
    new.clinic_id := public.my_clinic_id();
  elsif new.clinic_id is null and tg_nargs > 0 then
    owner_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
    if tg_table_name = 'patient_visits' then
      select clinic_id into new.clinic_id from public.patients where id = owner_id;
    elsif tg_table_name in ('patients', 'settings') then
      select clinic_id into new.clinic_id from public.sellers where id = owner_id;
    else
      select clinic_id into new.clinic_id from public.profiles where id = owner_id;
    end if;
  end if;
  return new;
end;
$$;

-- ---------- coordinator: the team member who follows the patient up ----------
alter table public.patients add column if not exists coordinator_id uuid references public.profiles(id) on delete set null;
create index if not exists patients_coordinator_id_idx on public.patients (coordinator_id);

-- Seller and coordinator always belong to the patient's own clinic. Named to run after
-- patients_set_clinic_id (same-timing triggers fire in name order) so clinic_id is known.
create or replace function public.guard_patient_people()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.responsible_seller_id is distinct from old.responsible_seller_id)
     and not public.is_clinic_seller(new.responsible_seller_id, new.clinic_id) then
    raise exception 'That seller isn''t part of this clinic';
  end if;
  if new.coordinator_id is not null
     and (tg_op = 'INSERT' or new.coordinator_id is distinct from old.coordinator_id)
     and not exists (select 1 from public.profiles where id = new.coordinator_id and clinic_id = new.clinic_id) then
    raise exception 'That coordinator isn''t part of this clinic';
  end if;
  return new;
end;
$$;

drop trigger if exists patients_zz_guard_people on public.patients;
create trigger patients_zz_guard_people
  before insert or update on public.patients
  for each row execute function public.guard_patient_people();

-- Who may reassign; which clinic the new seller belongs to is checked above.
create or replace function public.guard_patient_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_seller_id is distinct from old.responsible_seller_id
     and coalesce(current_setting('app.seller_merge', true), '') <> 'on'
     and not (auth.uid() = old.responsible_seller_id or public.is_admin(auth.uid())) then
    raise exception 'Only the responsible seller or an admin can reassign this patient';
  end if;
  return new;
end;
$$;

-- A seller creates patients as themselves; an admin can record one for any seller of the
-- clinic, account or not.
drop policy if exists "patients_insert_self" on public.patients;
create policy "patients_insert_self" on public.patients
  for insert with check (
    public.is_active_profile(auth.uid())
    and clinic_id = public.my_clinic_id()
    and (
      responsible_seller_id = auth.uid()
      or (public.is_admin(auth.uid()) and public.is_clinic_seller(responsible_seller_id, public.my_clinic_id()))
    )
  );

-- ---------- earned-by lock: moved only by a seller merge ----------
create or replace function public.set_patient_visit_earned_by()
returns trigger as $$
declare
  merging boolean := coalesce(current_setting('app.seller_merge', true), '') = 'on';
begin
  if new.visit1_actual is null then
    new.visit1_earned_by_seller_id := null;
  elsif merging and new.visit1_earned_by_seller_id is not null then
    null; -- merge_sellers moves it explicitly
  elsif TG_OP = 'UPDATE' and old.visit1_earned_by_seller_id is not null then
    new.visit1_earned_by_seller_id := old.visit1_earned_by_seller_id;
  else
    new.visit1_earned_by_seller_id := new.responsible_seller_id;
  end if;

  if new.visit2_actual is null then
    new.visit2_earned_by_seller_id := null;
  elsif merging and new.visit2_earned_by_seller_id is not null then
    null;
  elsif TG_OP = 'UPDATE' and old.visit2_earned_by_seller_id is not null then
    new.visit2_earned_by_seller_id := old.visit2_earned_by_seller_id;
  else
    new.visit2_earned_by_seller_id := new.responsible_seller_id;
  end if;

  return new;
end;
$$ language plpgsql;

create or replace function public.set_extra_visit_earned_by()
returns trigger as $$
declare
  merging boolean := coalesce(current_setting('app.seller_merge', true), '') = 'on';
begin
  if new.actual is null then
    new.earned_by_seller_id := null;
  elsif merging and new.earned_by_seller_id is not null then
    null;
  elsif TG_OP = 'UPDATE' and old.earned_by_seller_id is not null then
    new.earned_by_seller_id := old.earned_by_seller_id;
  else
    select responsible_seller_id into new.earned_by_seller_id from public.patients where id = new.patient_id;
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------- merge a seller without an account into another seller ----------
-- Used to fix duplicates ("Ahmet" typed twice) and to link a seller to an account once they
-- get one: everything credited to `from_id` — patients, earned visits — moves to `into_id`,
-- then `from_id` is removed. Commission rates move only if `into_id` has none of its own.
create or replace function public.merge_sellers(from_id uuid, into_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.my_clinic_id();
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin only';
  end if;
  -- security definer skips RLS, so support's read-only lock is checked by hand
  if public.is_superadmin(auth.uid()) and not public.support_can_write() then
    raise exception 'Support is read-only until editing is unlocked';
  end if;
  if from_id = into_id then
    raise exception 'Pick a different seller';
  end if;
  if not exists (select 1 from public.sellers where id = from_id and clinic_id = cid and profile_id is null) then
    raise exception 'Only a seller without an account can be merged away';
  end if;
  if not public.is_clinic_seller(into_id, cid) then
    raise exception 'Seller not found';
  end if;

  perform set_config('app.seller_merge', 'on', true);

  update public.patients set responsible_seller_id = into_id where responsible_seller_id = from_id;
  update public.patients set visit1_earned_by_seller_id = into_id where visit1_earned_by_seller_id = from_id;
  update public.patients set visit2_earned_by_seller_id = into_id where visit2_earned_by_seller_id = from_id;
  update public.patient_visits set earned_by_seller_id = into_id where earned_by_seller_id = from_id;

  if exists (select 1 from public.settings where user_id = into_id) then
    delete from public.settings where user_id = from_id;
  else
    update public.settings set user_id = into_id where user_id = from_id;
  end if;

  delete from public.sellers where id = from_id;

  perform set_config('app.seller_merge', '', true);
end;
$$;

revoke execute on function public.merge_sellers(uuid, uuid) from public, anon;
grant execute on function public.merge_sellers(uuid, uuid) to authenticated;

-- =====================================================================
-- ROLES AND PERMISSIONS (roadmap step B). Idempotent/safe to re-run.
-- =====================================================================
-- A member can hold several roles: admin, sales, coordinator, accountant. What each role may
-- do is data (role_permissions), checked everywhere through has_permission(). The old single
-- profiles.role column stays, kept in sync both ways by a trigger, so code that still reads
-- it (and is_admin()) keeps working: role = 'admin' exactly when 'admin' is in roles.

-- ---------- roles on profiles ----------
alter table public.profiles add column if not exists roles text[];

-- Backfill once (only rows that have none yet): admin → {admin, sales}; seller → {sales} —
-- nobody's access changes. A superadmin is no clinic member and has no roles.
update public.profiles
set roles = case role when 'admin' then array['admin', 'sales'] when 'seller' then array['sales'] else array[]::text[] end
where roles is null;

alter table public.profiles alter column roles set default array['sales'];
alter table public.profiles alter column roles set not null;
-- (step G: roles are the four built-ins or the clinic's own custom roles — checked by the
-- profiles_validate_roles trigger in the ROLES PAGE section, since a check can't look them up)
alter table public.profiles drop constraint if exists profiles_roles_check;

-- roles ↔ role, whichever one a change came through. A change to roles wins; a change to the
-- old role column (code that predates roles) promotes/demotes within roles.
create or replace function public.sync_profile_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'superadmin' then
    new.roles := array[]::text[];
    return new;
  end if;
  if tg_op = 'UPDATE' and new.roles is distinct from old.roles then
    new.roles := array(select distinct unnest(new.roles) order by 1);
    new.role := case when 'admin' = any(new.roles) then 'admin' else 'seller' end;
  elsif tg_op = 'INSERT' or new.role is distinct from old.role then
    if new.role = 'admin' and not ('admin' = any(new.roles)) then
      new.roles := array_append(new.roles, 'admin');
    elsif new.role = 'seller' then
      new.roles := array_remove(new.roles, 'admin');
      if cardinality(new.roles) = 0 then
        new.roles := array['sales'];
      end if;
    end if;
    new.roles := array(select distinct unnest(new.roles) order by 1);
  end if;
  return new;
end;
$$;

-- named to run after profiles_guard_privilege (same-timing triggers fire in name order), so
-- the guard sees exactly what the caller asked for
drop trigger if exists profiles_sync_roles on public.profiles;
create trigger profiles_sync_roles
  before insert or update on public.profiles
  for each row execute function public.sync_profile_roles();

-- ---------- the permission catalog ----------
-- `module` (step C) says which part of the product a permission belongs to; null = core.
create table if not exists public.permissions (
  key text primary key,
  module text,
  description text
);

create table if not exists public.role_permissions (
  role text not null check (role in ('admin', 'sales', 'coordinator', 'accountant')),
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
drop policy if exists "permissions_select_all" on public.permissions;
create policy "permissions_select_all" on public.permissions for select using (auth.uid() is not null);
drop policy if exists "role_permissions_select_all" on public.role_permissions;
create policy "role_permissions_select_all" on public.role_permissions for select using (auth.uid() is not null);

-- The catalog and the built-in roles' defaults are seeded in the ROLES PAGE section (step G)
-- below. Since step G a re-run no longer resets them: role_permissions holds the platform's
-- default templates (a superadmin can change them in /platform), so only permissions that
-- are new to the catalog get their defaults.

-- ---------- has_permission ----------
-- The roles that count for `uid`: their own, or — for a superadmin in support mode — those of
-- the member support is viewing as (an admin's when viewing as nobody). Support's read-only
-- lock still applies on top (the restrictive policies), whatever the roles say.
create or replace function public.member_roles(uid uuid)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select case
    when uid = auth.uid() and public.is_superadmin(uid) and public.support_clinic_id() is not null then
      coalesce(
        (select p.roles
         from public.support_sessions s
         join public.profiles p on p.id = s.view_as_user_id and p.clinic_id = s.clinic_id
         where s.superadmin_id = uid and s.ended_at is null and s.expires_at > now()
         order by s.started_at desc
         limit 1),
        array['admin'])
    else
      coalesce((select p.roles from public.profiles p where p.id = uid and p.clinic_id is not null), array[]::text[])
  end;
$$;

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select uid is not null
    and public.is_active_profile(uid)
    and exists (
      select 1 from public.role_permissions rp
      where rp.permission = perm and rp.role = any(public.member_roles(uid))
    );
$$;

-- Everything the caller may do, for the app to shape its pages and menus.
create or replace function public.my_permissions()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(distinct rp.permission order by rp.permission), array[]::text[])
  from public.role_permissions rp
  where public.is_active_profile(auth.uid())
    and rp.role = any(public.member_roles(auth.uid()));
$$;

revoke execute on function public.member_roles(uuid) from public, anon;
revoke execute on function public.has_permission(uuid, text) from public, anon;
revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.member_roles(uuid) to authenticated, service_role;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;
grant execute on function public.my_permissions() to authenticated;

-- A seller record counts as a live seller only for members with the Sales role (the others
-- are hidden from seller pickers); a seller without an account is unaffected.
create or replace function public.sync_seller_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinic_id is null or new.role = 'superadmin' then
    return new;
  end if;
  insert into public.sellers (id, clinic_id, name, profile_id, is_active)
  values (new.id, new.clinic_id, new.display_name, new.id, new.is_active and 'sales' = any(new.roles))
  on conflict (id) do update
    set name = coalesce(excluded.name, public.sellers.name),
        is_active = excluded.is_active;
  return new;
end;
$$;

drop trigger if exists profiles_sync_seller on public.profiles;
create trigger profiles_sync_seller
  after insert or update of clinic_id, display_name, is_active, role, roles on public.profiles
  for each row execute function public.sync_seller_from_profile();

update public.sellers s
set is_active = p.is_active and 'sales' = any(p.roles)
from public.profiles p
where p.id = s.profile_id and s.is_active is distinct from (p.is_active and 'sales' = any(p.roles));

-- ---------- who may change roles ----------
-- Only team.manage changes roles or active status; nobody changes their own roles; a clinic
-- never loses its last active admin. The service role (no auth.uid()) provisions accounts.
create or replace function public.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if old.clinic_id is not null and new.clinic_id is distinct from old.clinic_id then
      raise exception 'clinic_id cannot be changed once assigned';
    end if;
    return new;
  end if;
  if (new.role is distinct from old.role or new.roles is distinct from old.roles
      or new.is_active is distinct from old.is_active)
     and not public.has_permission(auth.uid(), 'team.manage') then
    raise exception 'Only an admin can change roles or active status';
  end if;
  if (new.role is distinct from old.role or new.roles is distinct from old.roles) and new.id = auth.uid() then
    raise exception 'You can''t change your own roles';
  end if;
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'clinic_id cannot be changed directly';
  end if;
  -- the roles sync runs after this trigger, so work out whether they stay an admin from
  -- whichever column this change came through
  if old.is_active and old.role = 'admin'
     and not (new.is_active and (case when new.roles is distinct from old.roles then 'admin' = any(new.roles)
                                      else new.role = 'admin' end))
     and not exists (
       select 1 from public.profiles o
       where o.clinic_id = old.clinic_id and o.id <> old.id and o.is_active and o.role = 'admin'
     ) then
    raise exception 'A clinic needs at least one active admin';
  end if;
  return new;
end;
$$;

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (
    auth.uid() = id or (public.has_permission(auth.uid(), 'team.manage') and clinic_id = public.my_clinic_id())
  )
  with check (
    auth.uid() = id or (public.has_permission(auth.uid(), 'team.manage') and clinic_id = public.my_clinic_id())
  );

-- ---------- patients ----------
drop policy if exists "patients_select_active_sellers" on public.patients;
create policy "patients_select_active_sellers" on public.patients
  for select using (public.has_permission(auth.uid(), 'patients.view') and clinic_id = public.my_clinic_id());

-- Anyone who adds patients adds them as themselves; sellers.assign records one for any
-- seller of the clinic, account or not.
drop policy if exists "patients_insert_self" on public.patients;
create policy "patients_insert_self" on public.patients
  for insert with check (
    public.has_permission(auth.uid(), 'patients.edit')
    and clinic_id = public.my_clinic_id()
    and (
      responsible_seller_id = auth.uid()
      or (public.has_permission(auth.uid(), 'sellers.assign') and public.is_clinic_seller(responsible_seller_id, public.my_clinic_id()))
    )
  );

drop policy if exists "patients_update_active_sellers" on public.patients;
create policy "patients_update_active_sellers" on public.patients
  for update using (public.has_permission(auth.uid(), 'patients.edit') and clinic_id = public.my_clinic_id())
  with check (public.has_permission(auth.uid(), 'patients.edit') and clinic_id = public.my_clinic_id());

-- The responsible seller can always delete their own patient (as before roles); anyone else
-- needs patients.delete.
drop policy if exists "patients_delete_owner_or_admin" on public.patients;
create policy "patients_delete_owner_or_admin" on public.patients
  for delete using (
    clinic_id = public.my_clinic_id()
    and (
      public.has_permission(auth.uid(), 'patients.delete')
      or (responsible_seller_id = auth.uid() and public.has_permission(auth.uid(), 'patients.edit'))
    )
  );

create or replace function public.guard_patient_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_seller_id is distinct from old.responsible_seller_id
     and coalesce(current_setting('app.seller_merge', true), '') <> 'on'
     and not (auth.uid() = old.responsible_seller_id or public.has_permission(auth.uid(), 'sellers.assign')) then
    raise exception 'Only the responsible seller or someone who assigns sellers can reassign this patient';
  end if;
  return new;
end;
$$;

-- Prices need money.edit, even for someone who can otherwise edit the patient. (Paid amounts
-- — the `actual` columns — follow the payments and are written by their trigger.)
create or replace function public.guard_patient_money()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_permission(auth.uid(), 'money.edit') then
    return new;
  end if;
  if tg_table_name = 'patients' then
    if (tg_op = 'INSERT' and (new.visit1_expected is not null or new.visit2_expected is not null))
       or (tg_op = 'UPDATE' and (new.visit1_expected is distinct from old.visit1_expected
                                 or new.visit2_expected is distinct from old.visit2_expected)) then
      raise exception 'You don''t have permission to change prices';
    end if;
  elsif (tg_op = 'INSERT' and new.expected is not null)
        or (tg_op = 'UPDATE' and new.expected is distinct from old.expected) then
    raise exception 'You don''t have permission to change prices';
  end if;
  return new;
end;
$$;

drop trigger if exists patients_guard_money on public.patients;
create trigger patients_guard_money
  before insert or update on public.patients
  for each row execute function public.guard_patient_money();
drop trigger if exists patient_visits_guard_money on public.patient_visits;
create trigger patient_visits_guard_money
  before insert or update on public.patient_visits
  for each row execute function public.guard_patient_money();

-- ---------- extra visits ----------
drop policy if exists "patient_visits_select_active_sellers" on public.patient_visits;
create policy "patient_visits_select_active_sellers" on public.patient_visits
  for select using (public.has_permission(auth.uid(), 'patients.view') and clinic_id = public.my_clinic_id());
drop policy if exists "patient_visits_insert_active_sellers" on public.patient_visits;
create policy "patient_visits_insert_active_sellers" on public.patient_visits
  for insert with check (
    created_by_seller_id = auth.uid() and public.has_permission(auth.uid(), 'patients.edit') and clinic_id = public.my_clinic_id()
  );
drop policy if exists "patient_visits_update_active_sellers" on public.patient_visits;
create policy "patient_visits_update_active_sellers" on public.patient_visits
  for update using (public.has_permission(auth.uid(), 'patients.edit') and clinic_id = public.my_clinic_id())
  with check (public.has_permission(auth.uid(), 'patients.edit') and clinic_id = public.my_clinic_id());
drop policy if exists "patient_visits_delete_active_sellers" on public.patient_visits;
create policy "patient_visits_delete_active_sellers" on public.patient_visits
  for delete using (public.has_permission(auth.uid(), 'patients.edit') and clinic_id = public.my_clinic_id());

-- ---------- extras, payments, transfers: see with patients.view, write with their own permission ----------
-- (payments: payments.record adds one, payments.edit changes or deletes one — step G)
do $$
declare
  t text;
  perm text;
  perm_change text;
begin
  foreach t in array array['patient_extras', 'patient_payments', 'transfers'] loop
    perm := case t when 'patient_extras' then 'money.edit' when 'patient_payments' then 'payments.record' else 'transfers.manage' end;
    perm_change := case t when 'patient_payments' then 'payments.edit' else perm end;
    execute format('drop policy if exists %I on public.%I', t || '_select_active', t);
    execute format('create policy %I on public.%I for select using (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_select_active', t, 'patients.view');
    execute format('drop policy if exists %I on public.%I', t || '_insert_active', t);
    execute format('create policy %I on public.%I for insert with check (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_insert_active', t, perm);
    execute format('drop policy if exists %I on public.%I', t || '_update_active', t);
    execute format('create policy %I on public.%I for update using (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id()) with check (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_update_active', t, perm_change, perm_change);
    execute format('drop policy if exists %I on public.%I', t || '_delete_active', t);
    execute format('create policy %I on public.%I for delete using (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_delete_active', t, perm_change);
  end loop;
end $$;

-- ---------- transfer companies and drivers ----------
-- Everyone sees the list (names on transfers); transfers.manage adds and edits (as sellers
-- always could); drivers.manage deletes.
do $$
declare
  t text;
begin
  foreach t in array array['transfer_companies', 'drivers'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_active', t);
    execute format('create policy %I on public.%I for insert with check (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_insert_active', t, 'transfers.manage');
    execute format('drop policy if exists %I on public.%I', t || '_update_active', t);
    execute format('create policy %I on public.%I for update using (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id()) with check (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_update_active', t, 'transfers.manage', 'transfers.manage');
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);
    execute format('create policy %I on public.%I for delete using (public.has_permission(auth.uid(), %L) and clinic_id = public.my_clinic_id())',
                   t || '_delete_admin', t, 'drivers.manage');
  end loop;
end $$;

-- ---------- sellers ----------
-- sellers.assign may add a seller by typing a new name (on a patient); sellers.manage runs
-- the list.
drop policy if exists "sellers_insert_admin" on public.sellers;
create policy "sellers_insert_admin" on public.sellers
  for insert with check (
    (public.has_permission(auth.uid(), 'sellers.manage') or public.has_permission(auth.uid(), 'sellers.assign'))
    and clinic_id = public.my_clinic_id() and profile_id is null
  );

drop policy if exists "sellers_update_admin" on public.sellers;
create policy "sellers_update_admin" on public.sellers
  for update using (public.has_permission(auth.uid(), 'sellers.manage') and clinic_id = public.my_clinic_id() and profile_id is null)
  with check (public.has_permission(auth.uid(), 'sellers.manage') and clinic_id = public.my_clinic_id() and profile_id is null);

drop policy if exists "sellers_delete_admin" on public.sellers;
create policy "sellers_delete_admin" on public.sellers
  for delete using (public.has_permission(auth.uid(), 'sellers.manage') and clinic_id = public.my_clinic_id() and profile_id is null);

-- ---------- commission settings ----------
drop policy if exists "settings_select_admin" on public.settings;
create policy "settings_select_admin" on public.settings
  for select using (
    (public.has_permission(auth.uid(), 'earnings.all') or public.has_permission(auth.uid(), 'sellers.manage'))
    and clinic_id = public.my_clinic_id()
  );

drop policy if exists "settings_admin_insert_no_account" on public.settings;
create policy "settings_admin_insert_no_account" on public.settings
  for insert with check (
    public.has_permission(auth.uid(), 'sellers.manage') and clinic_id = public.my_clinic_id()
    and exists (select 1 from public.sellers s where s.id = user_id and s.clinic_id = public.my_clinic_id() and s.profile_id is null)
  );
drop policy if exists "settings_admin_update_no_account" on public.settings;
create policy "settings_admin_update_no_account" on public.settings
  for update using (
    public.has_permission(auth.uid(), 'sellers.manage') and clinic_id = public.my_clinic_id()
    and exists (select 1 from public.sellers s where s.id = user_id and s.clinic_id = public.my_clinic_id() and s.profile_id is null)
  )
  with check (public.has_permission(auth.uid(), 'sellers.manage') and clinic_id = public.my_clinic_id());

-- ---------- quotes: still private per member, and only with quotes.use ----------
drop policy if exists "quotes_select_own" on public.quotes;
create policy "quotes_select_own" on public.quotes
  for select using (auth.uid() = user_id and clinic_id = public.my_clinic_id() and public.has_permission(auth.uid(), 'quotes.use'));
drop policy if exists "quotes_insert_own" on public.quotes;
create policy "quotes_insert_own" on public.quotes
  for insert with check (auth.uid() = user_id and clinic_id = public.my_clinic_id() and public.has_permission(auth.uid(), 'quotes.use'));
drop policy if exists "quotes_update_own" on public.quotes;
create policy "quotes_update_own" on public.quotes
  for update using (auth.uid() = user_id and clinic_id = public.my_clinic_id() and public.has_permission(auth.uid(), 'quotes.use'))
  with check (auth.uid() = user_id and clinic_id = public.my_clinic_id() and public.has_permission(auth.uid(), 'quotes.use'));
drop policy if exists "quotes_delete_own" on public.quotes;
create policy "quotes_delete_own" on public.quotes
  for delete using (auth.uid() = user_id and clinic_id = public.my_clinic_id() and public.has_permission(auth.uid(), 'quotes.use'));

-- ---------- activity log ----------
drop policy if exists "activity_log_select_admin" on public.activity_log;
create policy "activity_log_select_admin" on public.activity_log
  for select using (public.has_permission(auth.uid(), 'activity.view') and clinic_id = public.my_clinic_id());

-- ---------- clinic settings ----------
-- Each section of the clinic's settings has its own permission (step G): settings.branding,
-- settings.telegram, settings.money, drivers.manage (transfer defaults), messaging.manage
-- (driver messages / WhatsApp) — checked column by column below. settings.clinic is the old
-- all-sections key (Admin only), kept for code that predates step G.
create or replace function public.can_write_clinic_config(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from unnest(array['settings.clinic', 'settings.branding', 'settings.telegram', 'settings.money',
                               'drivers.manage', 'messaging.manage']) perm
    where public.has_permission(uid, perm)
  );
$$;
revoke execute on function public.can_write_clinic_config(uuid) from public, anon;
grant execute on function public.can_write_clinic_config(uuid) to authenticated, service_role;

drop policy if exists "clinic_config_insert_admin" on public.clinic_config;
create policy "clinic_config_insert_admin" on public.clinic_config
  for insert with check (public.can_write_clinic_config(auth.uid()) and clinic_id = public.my_clinic_id());
drop policy if exists "clinic_config_update_admin" on public.clinic_config;
create policy "clinic_config_update_admin" on public.clinic_config
  for update using (public.can_write_clinic_config(auth.uid()) and clinic_id = public.my_clinic_id());

create or replace function public.guard_clinic_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  branding_cols text[] := array['clinic_name', 'clinic_short_name', 'clinic_address', 'clinic_phone', 'clinic_email',
    'clinic_logo_url'];
  telegram_cols text[] := array['telegram_group_chat_id'];
  money_cols text[] := array['deduct_costs_from_commission', 'card_surcharge_rate'];
  driver_cols text[] := array['default_airport_company_id', 'default_airport_driver_id', 'default_local_company_id',
    'default_local_driver_id'];
  message_cols text[] := array['driver_messages_mode', 'whatsapp_phone_number_id', 'whatsapp_business_account_id',
    'whatsapp_template_single', 'whatsapp_template_day', 'whatsapp_template_lang', 'whatsapp_verified_at',
    'whatsapp_last_error', 'whatsapp_last_error_at'];
  allowed text[] := array['updated_at'];
begin
  if auth.uid() is null or public.has_permission(auth.uid(), 'settings.clinic') then
    return new;
  end if;
  if public.has_permission(auth.uid(), 'settings.branding') then
    allowed := allowed || branding_cols;
  end if;
  if public.has_permission(auth.uid(), 'settings.telegram') then
    allowed := allowed || telegram_cols;
  end if;
  if public.has_permission(auth.uid(), 'settings.money') then
    allowed := allowed || money_cols;
  end if;
  if public.has_permission(auth.uid(), 'drivers.manage') then
    allowed := allowed || driver_cols;
  end if;
  if public.has_permission(auth.uid(), 'messaging.manage') then
    allowed := allowed || message_cols;
  end if;
  -- (a clinic's row exists from its first settings save; a first insert isn't checked)
  if tg_op = 'UPDATE' and (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'You don''t have permission to change that setting';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_config_guard_change on public.clinic_config;
create trigger clinic_config_guard_change
  before insert or update on public.clinic_config
  for each row execute function public.guard_clinic_config_change();

-- ---------- merge sellers: sellers.manage ----------
create or replace function public.merge_sellers(from_id uuid, into_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.my_clinic_id();
begin
  if not public.has_permission(auth.uid(), 'sellers.manage') then
    raise exception 'You don''t have permission to manage sellers';
  end if;
  -- security definer skips RLS, so support's read-only lock is checked by hand
  if public.is_superadmin(auth.uid()) and not public.support_can_write() then
    raise exception 'Support is read-only until editing is unlocked';
  end if;
  if from_id = into_id then
    raise exception 'Pick a different seller';
  end if;
  if not exists (select 1 from public.sellers where id = from_id and clinic_id = cid and profile_id is null) then
    raise exception 'Only a seller without an account can be merged away';
  end if;
  if not public.is_clinic_seller(into_id, cid) then
    raise exception 'Seller not found';
  end if;

  perform set_config('app.seller_merge', 'on', true);

  update public.patients set responsible_seller_id = into_id where responsible_seller_id = from_id;
  update public.patients set visit1_earned_by_seller_id = into_id where visit1_earned_by_seller_id = from_id;
  update public.patients set visit2_earned_by_seller_id = into_id where visit2_earned_by_seller_id = from_id;
  update public.patient_visits set earned_by_seller_id = into_id where earned_by_seller_id = from_id;

  if exists (select 1 from public.settings where user_id = into_id) then
    delete from public.settings where user_id = from_id;
  else
    update public.settings set user_id = into_id where user_id = from_id;
  end if;

  delete from public.sellers where id = from_id;

  perform set_config('app.seller_merge', '', true);
end;
$$;

-- =====================================================================
-- MODULES PER CLINIC (roadmap step C). Idempotent/safe to re-run.
-- =====================================================================
-- A clinic can buy parts of the product: operations (transfers, hotels, drivers), sales
-- (quotes, commission) and accounting. Core (patients, payments, tasks, files, team,
-- settings) is always on. A permission counts only while its module (permissions.module) is
-- on for the member's clinic — checked inside has_permission(), so RLS, server actions and
-- pages all follow. 'inbox' is reserved for the WhatsApp/Instagram inbox.
alter table public.clinics add column if not exists modules text[] not null default array['operations', 'sales', 'accounting'];
alter table public.clinics drop constraint if exists clinics_modules_check;
alter table public.clinics add constraint clinics_modules_check
  check (modules <@ array['operations', 'sales', 'accounting', 'inbox']);

-- The modules of `uid`'s clinic — for a superadmin in support mode, the supported clinic's.
create or replace function public.member_modules(uid uuid)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select c.modules from public.clinics c
     where c.id = case
       when uid = auth.uid() and public.is_superadmin(uid) then public.support_clinic_id()
       else (select p.clinic_id from public.profiles p where p.id = uid)
     end),
    array[]::text[]);
$$;

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select uid is not null
    and public.is_active_profile(uid)
    and exists (
      select 1
      from public.role_permissions rp
      join public.permissions p on p.key = rp.permission
      where rp.permission = perm
        and rp.role = any(public.member_roles(uid))
        and (p.module is null or p.module = any(public.member_modules(uid)))
    );
$$;

create or replace function public.my_permissions()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(distinct rp.permission order by rp.permission), array[]::text[])
  from public.role_permissions rp
  join public.permissions p on p.key = rp.permission
  where public.is_active_profile(auth.uid())
    and rp.role = any(public.member_roles(auth.uid()))
    and (p.module is null or p.module = any(public.member_modules(auth.uid())));
$$;

revoke execute on function public.member_modules(uuid) from public, anon;
grant execute on function public.member_modules(uuid) to authenticated, service_role;

-- =====================================================================
-- DISCOUNTS (roadmap step E). Idempotent/safe to re-run.
-- =====================================================================
-- One optional discount per visit: a fixed amount or a % of the visit's price + extras, with
-- an optional reason. The app turns it into money in one place (visitDiscount) and takes it
-- off every expected total; paid commission is unaffected (it's the sum of payments).
do $$
declare
  col text;
begin
  foreach col in array array['visit1_discount', 'visit2_discount'] loop
    execute format('alter table public.patients add column if not exists %I text', col || '_type');
    execute format('alter table public.patients add column if not exists %I numeric(10,2)', col || '_value');
    execute format('alter table public.patients add column if not exists %I text', col || '_reason');
    execute format('alter table public.patients drop constraint if exists %I', 'patients_' || col || '_check');
    execute format(
      'alter table public.patients add constraint %I check ((%I is null and %I is null) or (%I in (''amount'', ''percent'') and %I is not null and %I > 0 and (%I = ''amount'' or %I <= 100)))',
      'patients_' || col || '_check', col || '_type', col || '_value', col || '_type', col || '_value', col || '_value', col || '_type', col || '_value');
  end loop;
end $$;

alter table public.patient_visits add column if not exists discount_type text;
alter table public.patient_visits add column if not exists discount_value numeric(10,2);
alter table public.patient_visits add column if not exists discount_reason text;
alter table public.patient_visits drop constraint if exists patient_visits_discount_check;
alter table public.patient_visits add constraint patient_visits_discount_check
  check ((discount_type is null and discount_value is null) or (discount_type in ('amount', 'percent') and discount_value is not null and discount_value > 0
                                   and (discount_type = 'amount' or discount_value <= 100)));

-- Prices and discounts need money.edit (step B's guard, now covering discounts too).
create or replace function public.guard_patient_money()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  money_cols text[] := case tg_table_name
    when 'patients' then array['visit1_expected', 'visit2_expected',
      'visit1_discount_type', 'visit1_discount_value', 'visit1_discount_reason',
      'visit2_discount_type', 'visit2_discount_value', 'visit2_discount_reason']
    else array['expected', 'discount_type', 'discount_value', 'discount_reason'] end;
  col text;
begin
  if auth.uid() is null or public.has_permission(auth.uid(), 'money.edit') then
    return new;
  end if;
  foreach col in array money_cols loop
    if (tg_op = 'INSERT' and to_jsonb(new) ->> col is not null)
       or (tg_op = 'UPDATE' and to_jsonb(new) -> col is distinct from to_jsonb(old) -> col) then
      raise exception 'You don''t have permission to change prices or discounts';
    end if;
  end loop;
  return new;
end;
$$;

-- =====================================================================
-- PATIENT FILES (roadmap step F). Idempotent/safe to re-run.
-- =====================================================================
-- A plain list of files per patient (x-rays, plans, passports…). Stored in a private bucket
-- under {clinic_id}/{patient_id}/{uuid}-{name}; the app uploads through short-lived signed
-- upload URLs and opens files through 1-hour signed links, both issued server-side after a
-- permission check. The storage policies below are a second line of defence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-files', 'patient-files', false, 20971520, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null default public.my_clinic_id() references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  path text not null unique,
  size bigint not null check (size >= 0 and size <= 20971520),
  mime text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists patient_files_patient_idx on public.patient_files (patient_id, created_at desc);

-- the file sits under its own clinic's and patient's folder, and the patient is this clinic's
create or replace function public.validate_patient_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id) then
    raise exception 'Patient not found';
  end if;
  if tg_op = 'INSERT' and split_part(new.path, '/', 1) || '/' || split_part(new.path, '/', 2)
       <> new.clinic_id::text || '/' || new.patient_id::text then
    raise exception 'File path doesn''t match the patient';
  end if;
  if tg_op = 'UPDATE' and (new.path is distinct from old.path or new.patient_id is distinct from old.patient_id
                           or new.clinic_id is distinct from old.clinic_id or new.uploaded_by is distinct from old.uploaded_by
                           or new.size is distinct from old.size) then
    raise exception 'Only a file''s name can be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists patient_files_validate on public.patient_files;
create trigger patient_files_validate
  before insert or update on public.patient_files
  for each row execute function public.validate_patient_file();

alter table public.patient_files enable row level security;

drop policy if exists "patient_files_select" on public.patient_files;
create policy "patient_files_select" on public.patient_files
  for select using (public.has_permission(auth.uid(), 'files.view') and clinic_id = public.my_clinic_id());

drop policy if exists "patient_files_insert" on public.patient_files;
create policy "patient_files_insert" on public.patient_files
  for insert with check (
    public.has_permission(auth.uid(), 'files.manage') and clinic_id = public.my_clinic_id() and uploaded_by = auth.uid()
  );

-- rename / delete: whoever uploaded it (files.manage), or anyone's with files.delete (step G)
drop policy if exists "patient_files_update" on public.patient_files;
create policy "patient_files_update" on public.patient_files
  for update using (
    clinic_id = public.my_clinic_id()
    and ((public.has_permission(auth.uid(), 'files.manage') and uploaded_by = auth.uid())
         or public.has_permission(auth.uid(), 'files.delete'))
  )
  with check (
    clinic_id = public.my_clinic_id()
    and (public.has_permission(auth.uid(), 'files.manage') or public.has_permission(auth.uid(), 'files.delete'))
  );

drop policy if exists "patient_files_delete" on public.patient_files;
create policy "patient_files_delete" on public.patient_files
  for delete using (
    clinic_id = public.my_clinic_id()
    and ((public.has_permission(auth.uid(), 'files.manage') and uploaded_by = auth.uid())
         or public.has_permission(auth.uid(), 'files.delete'))
  );

drop policy if exists "patient_files_support_readonly_insert" on public.patient_files;
create policy "patient_files_support_readonly_insert" on public.patient_files
  as restrictive for insert with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "patient_files_support_readonly_update" on public.patient_files;
create policy "patient_files_support_readonly_update" on public.patient_files
  as restrictive for update using (not public.is_superadmin(auth.uid()) or public.support_can_write())
  with check (not public.is_superadmin(auth.uid()) or public.support_can_write());
drop policy if exists "patient_files_support_readonly_delete" on public.patient_files;
create policy "patient_files_support_readonly_delete" on public.patient_files
  as restrictive for delete using (not public.is_superadmin(auth.uid()) or public.support_can_write());

-- ---------- storage: the clinic's own folder only ----------
drop policy if exists "patient_files_objects_select" on storage.objects;
create policy "patient_files_objects_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = public.my_clinic_id()::text
    and public.has_permission(auth.uid(), 'files.view')
  );
drop policy if exists "patient_files_objects_insert" on storage.objects;
create policy "patient_files_objects_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = public.my_clinic_id()::text
    and public.has_permission(auth.uid(), 'files.manage')
    and (not public.is_superadmin(auth.uid()) or public.support_can_write())
  );
drop policy if exists "patient_files_objects_delete" on storage.objects;
create policy "patient_files_objects_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = public.my_clinic_id()::text
    and (public.has_permission(auth.uid(), 'files.manage') or public.has_permission(auth.uid(), 'files.delete'))
    and (not public.is_superadmin(auth.uid()) or public.support_can_write())
  );

-- Support opening a patient's file is part of the support access log, like reading its history.
alter table public.support_access_log drop constraint if exists support_access_log_event_check;
alter table public.support_access_log add constraint support_access_log_event_check check (event in (
  'session_started', 'session_ended', 'session_extended',
  'editing_unlocked', 'editing_locked', 'view_as_changed',
  'page_viewed', 'record_history_viewed', 'record_file_opened', 'change_made'
));

-- =====================================================================
-- ROLES PAGE (roadmap step G). Idempotent/safe to re-run.
-- =====================================================================
-- Finer permissions (view / edit / delete where they mean something), and roles a clinic can
-- shape itself:
--   * role_permissions      — the platform's default templates for the built-in roles
--                             (Sales, Coordinator, Accountant); a superadmin edits them in /platform.
--   * clinic_roles          — a clinic's own custom roles, plus a row for each built-in role the
--                             clinic has customised (is_builtin). No row = the default template.
--   * clinic_role_permissions — what those roles may do.
-- Admin always has every permission and can't be edited. A permission new to the catalog gets
-- its defaults — in the templates and in clinics' customised built-in roles; custom roles
-- never gain anything by themselves.

alter table public.permissions add column if not exists legacy boolean not null default false;

create table if not exists public.clinic_roles (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  key text not null,
  name text,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key),
  check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  check ((is_builtin and key in ('sales', 'coordinator', 'accountant') and name is null)
         or (not is_builtin and key like 'custom\_%' and length(trim(name)) between 1 and 40))
);

create table if not exists public.clinic_role_permissions (
  clinic_id uuid not null,
  role text not null,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (clinic_id, role, permission),
  foreign key (clinic_id, role) references public.clinic_roles(clinic_id, key) on delete cascade
);

alter table public.clinic_roles enable row level security;
alter table public.clinic_role_permissions enable row level security;
-- Everyone in the clinic can read them (role names on the Team card, "what can I do"). They
-- are written only through the functions below, which check roles.edit / roles.delete.
drop policy if exists "clinic_roles_select_clinic" on public.clinic_roles;
create policy "clinic_roles_select_clinic" on public.clinic_roles
  for select using (clinic_id = public.my_clinic_id());
drop policy if exists "clinic_role_permissions_select_clinic" on public.clinic_role_permissions;
create policy "clinic_role_permissions_select_clinic" on public.clinic_role_permissions
  for select using (clinic_id = public.my_clinic_id());

-- ---------- the catalog ----------
drop table if exists pg_temp.perm_catalog;
create temp table perm_catalog (key text primary key, module text, description text, legacy boolean);
insert into perm_catalog (key, module, description, legacy) values
  ('patients.view',     null,         'See patients, visits and the calendar', false),
  ('patients.edit',     null,         'Add and edit patients, visits and travel', false),
  ('patients.delete',   null,         'Delete any patient (a seller can always delete their own)', false),
  ('patients.export',   null,         'Export patients to a CSV file', false),
  ('sellers.assign',    null,         'Record a patient for any seller, type a new seller, reassign any patient', false),
  ('sellers.manage',    null,         'Manage the seller list and sellers'' commission rates', false),
  ('money.edit',        null,         'Change prices, extras and discounts', false),
  ('payments.record',   null,         'Record new payments', false),
  ('payments.edit',     null,         'Edit and delete payments', false),
  ('files.view',        null,         'See and open patient files', false),
  ('files.manage',      null,         'Upload patient files; rename and delete your own', false),
  ('files.delete',      null,         'Rename and delete anyone''s patient files', false),
  ('transfers.manage',  'operations', 'Transfers page; book transfers and hotels; add and edit drivers', false),
  ('drivers.manage',    'operations', 'Delete drivers and companies; default drivers for new transfers', false),
  ('messaging.manage',  'operations', 'Driver messages: WhatsApp app / Business API / off, API details and templates', false),
  ('quotes.use',        'sales',      'Make and send quotes', false),
  ('earnings.own',      'sales',      'See your own commission', false),
  ('earnings.all',      'sales',      'See every seller''s earnings (Team page)', false),
  ('accounting.view',   'accounting', 'Accounting page', false),
  ('tasks.use',         null,         'Tasks', false),
  ('team.view',         null,         'See the team list in Settings, with emails', false),
  ('team.manage',       null,         'Add team members, change their roles, deactivate, reset passwords', false),
  ('team.delete',       null,         'Delete team members'' accounts', false),
  ('roles.view',        null,         'See what every role can do', false),
  ('roles.edit',        null,         'Create roles and change what roles can do', false),
  ('roles.delete',      null,         'Delete custom roles', false),
  ('activity.view',     null,         'Activity log', false),
  ('settings.branding', null,         'Clinic branding on confirmation letters and quotes', false),
  ('settings.telegram', null,         'Team Telegram group', false),
  ('settings.money',    null,         'Money rules: costs before commission, card surcharge', false),
  ('settings.clinic',   null,         'All clinic settings (before step G; Admin only)', true);

-- The built-in roles' defaults. Admin is everything (it isn't listed: role_has_permission()
-- answers yes for it).
drop table if exists pg_temp.perm_defaults;
create temp table perm_defaults (role text, permission text, primary key (role, permission));
insert into perm_defaults (role, permission)
select 'sales', unnest(array['patients.view', 'patients.edit', 'patients.export', 'money.edit', 'payments.record',
                             'payments.edit', 'files.view', 'files.manage', 'transfers.manage', 'quotes.use',
                             'earnings.own', 'accounting.view', 'tasks.use'])
union all
select 'coordinator', unnest(array['patients.view', 'patients.edit', 'patients.export', 'sellers.assign', 'money.edit',
                                   'payments.record', 'payments.edit', 'files.view', 'files.manage', 'transfers.manage',
                                   'drivers.manage', 'accounting.view', 'tasks.use'])
union all
select 'accountant', unnest(array['patients.view', 'patients.export', 'payments.record', 'payments.edit', 'files.view',
                                  'earnings.all', 'accounting.view', 'tasks.use'])
union all
select 'admin', key from perm_catalog;

update public.permissions p
set module = c.module, description = c.description, legacy = c.legacy
from perm_catalog c
where p.key = c.key and (p.module, p.description, p.legacy) is distinct from (c.module, c.description, c.legacy);

-- Only permissions new to the catalog get their defaults — a re-run never undoes a
-- superadmin's template edits or a clinic's own choices.
with new_perms as (
  insert into public.permissions (key, module, description, legacy)
  select key, module, description, legacy from perm_catalog
  on conflict (key) do nothing
  returning key
),
templates as (
  insert into public.role_permissions (role, permission)
  select d.role, d.permission from perm_defaults d join new_perms n on n.key = d.permission
  on conflict do nothing
  returning 1
)
insert into public.clinic_role_permissions (clinic_id, role, permission)
select cr.clinic_id, cr.key, d.permission
from public.clinic_roles cr
join perm_defaults d on d.role = cr.key
join new_perms n on n.key = d.permission
where cr.is_builtin
on conflict do nothing;

drop table pg_temp.perm_defaults;
drop table pg_temp.perm_catalog;

-- ---------- who has what ----------
-- The clinic whose roles count for `uid` — for a superadmin in support mode, the supported one.
create or replace function public.member_clinic_id(uid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select case
    when uid = auth.uid() and public.is_superadmin(uid) then public.support_clinic_id()
    else (select p.clinic_id from public.profiles p where p.id = uid)
  end;
$$;

-- Whether role `r` of clinic `cid` has `perm`: Admin always; a custom or customised role from
-- the clinic's own list; otherwise the platform's default template.
create or replace function public.role_has_permission(cid uuid, r text, perm text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when r = 'admin' then true
    when exists (select 1 from public.clinic_roles cr where cr.clinic_id = cid and cr.key = r) then
      exists (select 1 from public.clinic_role_permissions crp
              where crp.clinic_id = cid and crp.role = r and crp.permission = perm)
    else exists (select 1 from public.role_permissions rp where rp.role = r and rp.permission = perm)
  end;
$$;

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select uid is not null
    and public.is_active_profile(uid)
    and exists (
      select 1 from public.permissions p
      where p.key = perm
        and (p.module is null or p.module = any(public.member_modules(uid)))
        and exists (
          select 1 from unnest(public.member_roles(uid)) r
          where public.role_has_permission(public.member_clinic_id(uid), r, perm)
        )
    );
$$;

create or replace function public.my_permissions()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(p.key order by p.key), array[]::text[])
  from public.permissions p
  where public.is_active_profile(auth.uid())
    and (p.module is null or p.module = any(public.member_modules(auth.uid())))
    and exists (
      select 1 from unnest(public.member_roles(auth.uid())) r
      where public.role_has_permission(public.member_clinic_id(auth.uid()), r, p.key)
    );
$$;

revoke execute on function public.member_clinic_id(uuid) from public, anon;
revoke execute on function public.role_has_permission(uuid, text, text) from public, anon;
grant execute on function public.member_clinic_id(uuid) to authenticated, service_role;
grant execute on function public.role_has_permission(uuid, text, text) to authenticated, service_role;
revoke execute on function public.has_permission(uuid, text) from public, anon;
revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;
grant execute on function public.my_permissions() to authenticated;

-- ---------- a member's roles must exist ----------
-- The built-ins, or one of the clinic's own custom roles. Named to run after
-- profiles_sync_roles, so it checks the final list.
create or replace function public.validate_profile_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'superadmin' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.roles is not distinct from old.roles and new.clinic_id is not distinct from old.clinic_id then
    return new;
  end if;
  if exists (
    select 1 from unnest(new.roles) r
    where r not in ('admin', 'sales', 'coordinator', 'accountant')
      and not exists (select 1 from public.clinic_roles cr where cr.clinic_id = new.clinic_id and cr.key = r and not cr.is_builtin)
  ) then
    raise exception 'Unknown role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_roles on public.profiles;
create trigger profiles_validate_roles
  before insert or update on public.profiles
  for each row execute function public.validate_profile_roles();

-- ---------- changing roles ----------
-- Only through these. roles.edit may change any role but Admin (including roles they hold
-- themselves — the clinic's admin decides who gets roles.edit); roles.delete removes custom
-- roles nobody holds. Support is read-only until editing is unlocked (security definer skips
-- the RLS rule that normally enforces that).
create or replace function public.assert_can_change_roles(perm text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  cid uuid := public.member_clinic_id(auth.uid());
begin
  if cid is null or not public.has_permission(auth.uid(), perm) then
    raise exception 'You don''t have permission to change roles';
  end if;
  if public.is_superadmin(auth.uid()) and not public.support_can_write() then
    raise exception 'Support is read-only until editing is unlocked';
  end if;
  return cid;
end;
$$;

-- Create (p_key null) or change a role; returns its key. Built-in roles keep their names.
create or replace function public.save_clinic_role(p_key text, p_name text, p_permissions text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.assert_can_change_roles('roles.edit');
  k text := nullif(trim(coalesce(p_key, '')), '');
  n text := nullif(trim(coalesce(p_name, '')), '');
  builtin boolean;
begin
  if k = 'admin' then
    raise exception 'The Admin role always has every permission';
  end if;
  builtin := coalesce(k in ('sales', 'coordinator', 'accountant'), false);
  if k is null then
    k := 'custom_' || substr(md5(gen_random_uuid()::text), 1, 10);
  elsif not builtin and not exists (select 1 from public.clinic_roles where clinic_id = cid and key = k and not is_builtin) then
    raise exception 'Role not found';
  end if;
  if not builtin then
    if n is null then
      raise exception 'Give the role a name';
    end if;
    if length(n) > 40 then
      raise exception 'Keep the role name under 40 characters';
    end if;
    if lower(n) in ('admin', 'sales', 'coordinator', 'accountant')
       or exists (select 1 from public.clinic_roles where clinic_id = cid and key <> k and not is_builtin and lower(name) = lower(n)) then
      raise exception 'There''s already a role called %', n;
    end if;
  end if;
  if exists (
    select 1 from unnest(coalesce(p_permissions, array[]::text[])) x
    where not exists (select 1 from public.permissions p where p.key = x and not p.legacy)
  ) then
    raise exception 'Unknown permission';
  end if;

  insert into public.clinic_roles (clinic_id, key, name, is_builtin)
  values (cid, k, case when builtin then null else n end, builtin)
  on conflict (clinic_id, key) do update set name = excluded.name, updated_at = now();

  delete from public.clinic_role_permissions where clinic_id = cid and role = k;
  insert into public.clinic_role_permissions (clinic_id, role, permission)
  select distinct cid, k, x from unnest(coalesce(p_permissions, array[]::text[])) x;
  return k;
end;
$$;

-- A built-in role back to the platform's default template.
create or replace function public.reset_clinic_role(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.assert_can_change_roles('roles.edit');
begin
  if p_key not in ('sales', 'coordinator', 'accountant') then
    raise exception 'Only a built-in role can be reset';
  end if;
  delete from public.clinic_roles where clinic_id = cid and key = p_key and is_builtin;
end;
$$;

create or replace function public.delete_clinic_role(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.assert_can_change_roles('roles.delete');
  holders int;
begin
  if not exists (select 1 from public.clinic_roles where clinic_id = cid and key = p_key and not is_builtin) then
    raise exception 'Only a custom role can be deleted';
  end if;
  select count(*) into holders from public.profiles where clinic_id = cid and p_key = any(roles);
  if holders > 0 then
    raise exception 'Take this role off its % member(s) first', holders;
  end if;
  delete from public.clinic_roles where clinic_id = cid and key = p_key;
end;
$$;

revoke execute on function public.assert_can_change_roles(text) from public, anon, authenticated;
revoke execute on function public.save_clinic_role(text, text, text[]) from public, anon;
revoke execute on function public.reset_clinic_role(text) from public, anon;
revoke execute on function public.delete_clinic_role(text) from public, anon;
grant execute on function public.save_clinic_role(text, text, text[]) to authenticated;
grant execute on function public.reset_clinic_role(text) to authenticated;
grant execute on function public.delete_clinic_role(text) to authenticated;

-- =====================================================================
-- ONE-TIME MANUAL STEP — not part of the idempotent migration above.
-- Promote exactly one existing account to superadmin (there's no self-serve path to
-- becoming the first one, same as today's "first admin" reality). Run by hand, once,
-- after confirming the target user's id.
--
-- A direct SQL Editor / DB connection has no auth.uid() (no request-scoped JWT), so
-- guard_profile_privilege_change()'s is_admin(auth.uid()) check always fails there —
-- disable that one trigger for the duration of this single statement, same as any other
-- superuser-run administrative update:
--
--   alter table public.profiles disable trigger profiles_guard_privilege;
--   update public.profiles
--   set role = 'superadmin', clinic_id = null
--   where id = '<your own auth.users id>';
--   alter table public.profiles enable trigger profiles_guard_privilege;
--
-- =====================================================================

-- =====================================================================
-- PROFILES & USERS (roadmap step J). Idempotent/safe to re-run.
-- =====================================================================

-- ---------- phone: international format, used for WhatsApp in step M ----------
-- Same format as normalizePhone() in src/lib/phone.ts. Unique within a clinic so an
-- incoming WhatsApp number maps to exactly one person.
alter table public.profiles add column if not exists phone text;
alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');
create unique index if not exists profiles_clinic_phone_key
  on public.profiles (clinic_id, phone) where phone is not null;

-- ---------- photo ----------
-- Null = no photo. The file always lives at avatars/{clinic_id}/{user_id}, so a profile can't
-- point at anyone else's file; the timestamp only busts browser caches after a change.
alter table public.profiles add column if not exists avatar_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- read: active members, inside their own clinic's folder
drop policy if exists "avatars_objects_select" on storage.objects;
create policy "avatars_objects_select" on storage.objects
  for select using (
    bucket_id = 'avatars'
    and public.is_active_profile(auth.uid())
    and (storage.foldername(name))[1] = public.my_clinic_id()::text
  );

-- write: only your own file
drop policy if exists "avatars_objects_insert" on storage.objects;
create policy "avatars_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and public.is_active_profile(auth.uid())
    and name = public.my_clinic_id()::text || '/' || auth.uid()::text
  );

drop policy if exists "avatars_objects_update" on storage.objects;
create policy "avatars_objects_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and public.is_active_profile(auth.uid())
    and name = public.my_clinic_id()::text || '/' || auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and name = public.my_clinic_id()::text || '/' || auth.uid()::text
  );

drop policy if exists "avatars_objects_delete" on storage.objects;
create policy "avatars_objects_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and public.is_active_profile(auth.uid())
    and name = public.my_clinic_id()::text || '/' || auth.uid()::text
  );

-- ---------- a deleted account stays recognisable in the activity history ----------
-- actor_id is cleared when the login is deleted (on delete set null); the app copies it here
-- first. No foreign key on purpose: it outlives the account, and the same id is the deleted
-- account's surviving seller record, which still carries their name.
alter table public.activity_log add column if not exists former_actor_id uuid;

-- =====================================================================
-- COORDINATORS & FILTERS (roadmap step K). Idempotent/safe to re-run.
-- =====================================================================

-- ---------- saved default filters, per user ----------
-- { "patients": {"seller": "all"|"me"|<seller id>, "coordinator": "all"|"me"|"none"|<profile id>},
--   "dashboard": {...}, "calendar": {...}, "transfers": {...} }. On the user's own settings row,
-- so the existing settings policies apply (own row; support reads the viewed-as member's).
alter table public.settings add column if not exists saved_filters jsonb not null default '{}'::jsonb;
alter table public.settings drop constraint if exists settings_saved_filters_object;
alter table public.settings add constraint settings_saved_filters_object check (jsonb_typeof(saved_filters) = 'object');

-- ---------- a new coordinator must be able to edit patients ----------
-- Seller and coordinator always belong to the patient's own clinic; a coordinator newly set
-- (or changed) must also be an active member with patients.edit. One already assigned stays,
-- even if they're deactivated or lose the role later. Named to run after
-- patients_set_clinic_id (same-timing triggers fire in name order) so clinic_id is known.
create or replace function public.guard_patient_people()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.responsible_seller_id is distinct from old.responsible_seller_id)
     and not public.is_clinic_seller(new.responsible_seller_id, new.clinic_id) then
    raise exception 'That seller isn''t part of this clinic';
  end if;
  if new.coordinator_id is not null
     and (tg_op = 'INSERT' or new.coordinator_id is distinct from old.coordinator_id) then
    if not exists (select 1 from public.profiles where id = new.coordinator_id and clinic_id = new.clinic_id) then
      raise exception 'That coordinator isn''t part of this clinic';
    end if;
    if not public.has_permission(new.coordinator_id, 'patients.edit') then
      raise exception 'That team member can''t coordinate patients (they need to be active and able to edit patients)';
    end if;
  end if;
  return new;
end;
$$;

-- =====================================================================
-- CURRENCIES (roadmap step L). Idempotent/safe to re-run.
-- =====================================================================
-- A clinic has one MAIN currency (its reporting currency: commission, tiers, totals) and,
-- optionally, other currencies it deals in. A patient's prices, extras and discounts are in
-- the patient's DEAL currency; `deal_rate` (1 deal unit = x main, fixed on the day the price
-- is agreed) turns them into the main currency. A payment can be handed over in any clinic
-- currency: `paid_amount` in `currency`, `amount` = its value in the deal currency (what
-- counts toward the visit, as before) and `main_amount` = its value in the main currency on
-- the day it was received. Hotel and transfer costs are the clinic's own costs, in the main
-- currency. A clinic with no other currencies has deal_rate 1 and rates 1 everywhere.

create or replace function public.supported_currencies()
returns text[]
language sql
immutable
as $$ select array['GBP', 'EUR', 'USD', 'TRY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CAD', 'AUD'] $$;

-- ---------- exchange rates: any pair, more precision ----------
-- Market rates are stored against EUR (base 'EUR', one row per currency per day) and crossed
-- in the app; the older GBP/USD → TRY rows stay as history.
alter table public.exchange_rates alter column rate type numeric(18,8);

-- ---------- clinic settings ----------
alter table public.clinic_config add column if not exists main_currency text not null default 'GBP';
alter table public.clinic_config add column if not exists deal_currencies text[] not null default '{}';
-- { "EUR": 0.86 } = the clinic's own fixed rate, 1 EUR = 0.86 main; a currency not listed
-- uses the automatic market rate.
alter table public.clinic_config add column if not exists fixed_rates jsonb not null default '{}'::jsonb;
alter table public.clinic_config drop constraint if exists clinic_config_currencies_check;
alter table public.clinic_config add constraint clinic_config_currencies_check check (
  main_currency = any(public.supported_currencies())
  and deal_currencies <@ public.supported_currencies()
  and not (main_currency = any(deal_currencies))
  and jsonb_typeof(fixed_rates) = 'object'
);

-- ---------- per-seller usual currency (their new patients start in it) ----------
alter table public.sellers add column if not exists default_currency text;
alter table public.sellers drop constraint if exists sellers_default_currency_check;
alter table public.sellers add constraint sellers_default_currency_check
  check (default_currency is null or default_currency = any(public.supported_currencies()));

-- ---------- patients: deal currency + the rate it was agreed at ----------
alter table public.patients add column if not exists currency text;
alter table public.patients add column if not exists deal_rate numeric(18,8) not null default 1;
alter table public.patients add column if not exists deal_rate_on date;
-- 'auto' market rate, 'clinic' the clinic's fixed rate, 'manual' corrected by hand
alter table public.patients add column if not exists deal_rate_source text;
update public.patients p
set currency = coalesce((select c.main_currency from public.clinic_config c where c.clinic_id = p.clinic_id), 'GBP')
where p.currency is null;
alter table public.patients alter column currency set not null;
alter table public.patients drop constraint if exists patients_currency_check;
alter table public.patients add constraint patients_currency_check check (
  currency = any(public.supported_currencies())
  and deal_rate > 0
  and (deal_rate_source is null or deal_rate_source in ('auto', 'clinic', 'manual'))
);

-- ---------- payments: what was handed over, and its value in deal + main currency ----------
alter table public.patient_payments add column if not exists currency text;
alter table public.patient_payments add column if not exists paid_amount numeric(12,2);
alter table public.patient_payments add column if not exists rate_to_deal numeric(18,8);
alter table public.patient_payments add column if not exists rate_to_main numeric(18,8);
alter table public.patient_payments add column if not exists main_amount numeric(12,2);
alter table public.patient_payments add column if not exists rate_source text;
update public.patient_payments x
set currency = p.currency, paid_amount = x.amount, rate_to_deal = 1, rate_to_main = 1, main_amount = x.amount
from public.patients p
where p.id = x.patient_id and x.currency is null;
alter table public.patient_payments alter column currency set not null;
alter table public.patient_payments alter column paid_amount set not null;
alter table public.patient_payments alter column rate_to_deal set not null;
alter table public.patient_payments alter column rate_to_main set not null;
alter table public.patient_payments alter column main_amount set not null;
alter table public.patient_payments drop constraint if exists patient_payments_currency_check;
alter table public.patient_payments add constraint patient_payments_currency_check check (
  currency = any(public.supported_currencies())
  and paid_amount > 0 and rate_to_deal > 0 and rate_to_main > 0
  and (rate_source is null or rate_source in ('auto', 'clinic', 'manual'))
);

-- The clinic's main currency (GBP for a clinic without a settings row yet).
create or replace function public.clinic_main_currency(p_clinic uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select main_currency from public.clinic_config where clinic_id = p_clinic), 'GBP') $$;

-- Patients: a new patient starts in the main currency unless the app says otherwise; the main
-- currency always has rate 1; the deal currency is locked once a payment exists; changing the
-- currency or its rate on an existing patient needs money.edit. Named to run after
-- patients_set_clinic_id (same-timing triggers fire in name order).
create or replace function public.guard_patient_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  main text := public.clinic_main_currency(new.clinic_id);
begin
  new.currency := coalesce(new.currency, main);
  if new.currency = main then
    new.deal_rate := 1;
    new.deal_rate_source := null;
  end if;
  if tg_op = 'UPDATE' then
    if new.currency is distinct from old.currency
       and exists (select 1 from public.patient_payments where patient_id = new.id) then
      raise exception 'The deal currency can''t change once a payment is recorded';
    end if;
    if auth.uid() is not null
       and not public.has_permission(auth.uid(), 'money.edit')
       and (new.currency is distinct from old.currency or new.deal_rate is distinct from old.deal_rate) then
      raise exception 'You don''t have permission to change the deal currency or its rate';
    end if;
  elsif new.deal_rate_source = 'manual' and auth.uid() is not null
        and not public.has_permission(auth.uid(), 'money.edit') then
    raise exception 'You don''t have permission to set an exchange rate';
  end if;
  return new;
end;
$$;
drop trigger if exists patients_set_currency on public.patients;
create trigger patients_set_currency before insert or update on public.patients
  for each row execute function public.guard_patient_currency();

-- Payments: the currency defaults to the patient's deal currency; `amount` (deal) and
-- `main_amount` are always worked out here from paid_amount × rate — never trusted from the
-- client. Same currency = rate 1. A hand-corrected rate needs money.edit. Named to run before
-- patient_payments_validate (which works the card surcharge out from `amount`).
create or replace function public.set_payment_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deal text;
  main text;
begin
  select p.currency, public.clinic_main_currency(p.clinic_id) into deal, main
  from public.patients p where p.id = new.patient_id;
  if deal is null then
    raise exception 'Patient not found';
  end if;
  new.currency := coalesce(new.currency, deal);
  new.paid_amount := coalesce(new.paid_amount, new.amount);
  if new.currency = deal then new.rate_to_deal := 1; end if;
  if new.currency = main then new.rate_to_main := 1; end if;
  if deal = main then new.rate_to_main := new.rate_to_deal; end if;
  if new.rate_to_deal is null or new.rate_to_main is null then
    raise exception 'No exchange rate for %', new.currency;
  end if;
  if new.currency = deal and new.currency = main then new.rate_source := null; end if;
  if new.rate_source = 'manual' and auth.uid() is not null
     and not public.has_permission(auth.uid(), 'money.edit')
     and (tg_op = 'INSERT' or new.rate_to_deal is distinct from old.rate_to_deal
          or new.rate_to_main is distinct from old.rate_to_main) then
    raise exception 'You don''t have permission to set an exchange rate';
  end if;
  new.amount := round(new.paid_amount * new.rate_to_deal, 2);
  new.main_amount := round(new.paid_amount * new.rate_to_main, 2);
  return new;
end;
$$;
drop trigger if exists patient_payments_currency on public.patient_payments;
create trigger patient_payments_currency before insert or update on public.patient_payments
  for each row execute function public.set_payment_currency();

-- ---------- clinic settings guard: currencies are money settings; the main currency is
-- fixed once the clinic has patients (changing it then means converting data — support) ----------
create or replace function public.guard_clinic_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  branding_cols text[] := array['clinic_name', 'clinic_short_name', 'clinic_address', 'clinic_phone', 'clinic_email',
    'clinic_logo_url'];
  telegram_cols text[] := array['telegram_group_chat_id'];
  money_cols text[] := array['deduct_costs_from_commission', 'card_surcharge_rate', 'main_currency', 'deal_currencies',
    'fixed_rates'];
  driver_cols text[] := array['default_airport_company_id', 'default_airport_driver_id', 'default_local_company_id',
    'default_local_driver_id'];
  message_cols text[] := array['driver_messages_mode', 'whatsapp_phone_number_id', 'whatsapp_business_account_id',
    'whatsapp_template_single', 'whatsapp_template_day', 'whatsapp_template_lang', 'whatsapp_verified_at',
    'whatsapp_last_error', 'whatsapp_last_error_at'];
  allowed text[] := array['updated_at'];
begin
  if auth.uid() is not null
     and new.main_currency is distinct from (case when tg_op = 'UPDATE' then old.main_currency else 'GBP' end)
     and exists (select 1 from public.patients where clinic_id = new.clinic_id) then
    raise exception 'The main currency can''t be changed once the clinic has patients — contact support';
  end if;
  if auth.uid() is null or public.has_permission(auth.uid(), 'settings.clinic') then
    return new;
  end if;
  if public.has_permission(auth.uid(), 'settings.branding') then
    allowed := allowed || branding_cols;
  end if;
  if public.has_permission(auth.uid(), 'settings.telegram') then
    allowed := allowed || telegram_cols;
  end if;
  if public.has_permission(auth.uid(), 'settings.money') then
    allowed := allowed || money_cols;
  end if;
  if public.has_permission(auth.uid(), 'drivers.manage') then
    allowed := allowed || driver_cols;
  end if;
  if public.has_permission(auth.uid(), 'messaging.manage') then
    allowed := allowed || message_cols;
  end if;
  -- (a clinic's row exists from its first settings save; a first insert isn't checked)
  if tg_op = 'UPDATE' and (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'You don''t have permission to change that setting';
  end if;
  return new;
end;
$$;

-- ---------- My settings: "also show approx. in …" ----------
-- The per-user `currency` column used to relabel every amount (without converting it); money
-- is now always in the clinic's main currency and `currency` is no longer read. The personal
-- extra figure (TRY only before) can be in any supported currency.
alter table public.settings add column if not exists approx_currency text not null default 'TRY';
alter table public.settings drop constraint if exists settings_approx_currency_check;
alter table public.settings add constraint settings_approx_currency_check
  check (approx_currency = any(public.supported_currencies()));

-- ---------- a seller's usual currency ----------
-- Set from Clinic settings → Money for any seller, account or not (an account's seller row
-- is otherwise only changed through its profile). Must be one of the clinic's currencies.
create or replace function public.set_seller_currency(p_seller uuid, p_currency text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.my_clinic_id();
  cfg public.clinic_config;
begin
  if cid is null or not (public.has_permission(auth.uid(), 'settings.money') or public.has_permission(auth.uid(), 'sellers.manage')) then
    raise exception 'You don''t have permission to change that';
  end if;
  if public.is_superadmin(auth.uid()) and not public.support_can_write() then
    raise exception 'Support is read-only until editing is unlocked';
  end if;
  select * into cfg from public.clinic_config where clinic_id = cid;
  if p_currency is not null
     and p_currency <> coalesce(cfg.main_currency, 'GBP')
     and not (p_currency = any(coalesce(cfg.deal_currencies, '{}'))) then
    raise exception 'The clinic doesn''t deal in %', p_currency;
  end if;
  update public.sellers set default_currency = p_currency where id = p_seller and clinic_id = cid;
  if not found then
    raise exception 'Seller not found';
  end if;
end;
$$;
revoke execute on function public.set_seller_currency(uuid, text) from public, anon;
grant execute on function public.set_seller_currency(uuid, text) to authenticated;

-- ---------- per-user interface language (Turkish translation) ----------
alter table public.profiles add column if not exists language text not null default 'en'
  check (language in ('en', 'tr'));

-- ---------- lookups that used to load every patient (perf fix 2, phase A) ----------
-- "Newest first" lists of one clinic read an index instead of the whole clinic.
create index if not exists patients_clinic_confirmation_idx
  on public.patients (clinic_id, confirmation_date desc nulls last);
create index if not exists activity_log_clinic_created_idx
  on public.activity_log (clinic_id, created_at desc);

-- Everyone who coordinates at least one patient — the coordinator filters also list people
-- who can no longer coordinate but still have patients. Runs as the caller, so RLS applies.
create or replace function public.patient_coordinator_ids(p_clinic uuid)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select distinct coordinator_id
  from public.patients
  where clinic_id = p_clinic and coordinator_id is not null;
$$;
revoke execute on function public.patient_coordinator_ids(uuid) from public, anon;
grant execute on function public.patient_coordinator_ids(uuid) to authenticated;

-- Hotel names and room types already used on the clinic's patients, for autocomplete.
-- Sorted by code point (collate "C"), the same order the app used when it sorted them itself.
create or replace function public.patient_stay_options(p_clinic uuid)
returns table (hotels text[], room_types text[])
language sql
stable
set search_path = public
as $$
  select
    array(
      select distinct h collate "C" from public.patients p, unnest(array[p.visit1_hotel_name, p.visit2_hotel_name]) h
      where p.clinic_id = p_clinic and h <> '' order by 1
    ),
    array(
      select distinct r collate "C" from public.patients p, unnest(array[p.visit1_room_type, p.visit2_room_type]) r
      where p.clinic_id = p_clinic and r <> '' order by 1
    );
$$;
revoke execute on function public.patient_stay_options(uuid) from public, anon;
grant execute on function public.patient_stay_options(uuid) to authenticated;

-- ---------- more of the same (perf fix 2, phase B) ----------
-- Every seller responsible for at least one patient (seller filters list only those).
create or replace function public.patient_seller_ids(p_clinic uuid)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select distinct responsible_seller_id
  from public.patients
  where clinic_id = p_clinic and responsible_seller_id is not null;
$$;
revoke execute on function public.patient_seller_ids(uuid) from public, anon;
grant execute on function public.patient_seller_ids(uuid) to authenticated;

-- The months (YYYY-MM, newest first) that have at least one payment.
create or replace function public.payment_months(p_clinic uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(m order by m desc), '{}')
  from (select distinct to_char(paid_on, 'YYYY-MM') m from public.patient_payments where clinic_id = p_clinic) x;
$$;
revoke execute on function public.payment_months(uuid) from public, anon;
grant execute on function public.payment_months(uuid) to authenticated;

-- Patients with a visit whose money may not add up: owed (price + extras − discount) differs
-- from what was paid toward it, once it's due (money taken, completed, or its date reached —
-- with two days' margin for the viewer's time zone). A deliberately wide net — the app's own
-- balance rules (lib/balance: visitBalances + isMismatch) decide what is really listed; this
-- only saves loading every patient to find those few. It must never be narrower than those
-- rules: visit 2 is checked even when not needed, and every due visit with a percentage
-- discount is included whatever its rounding.
-- One array, not a set of rows: the API caps a set at 1,000 rows without saying so.
drop function if exists public.patient_open_balance_ids(uuid);
create or replace function public.patient_open_balance_ids(p_clinic uuid)
returns uuid[]
language sql
stable
set search_path = public
as $$
  with visits as (
    select p.id as patient_id, null::uuid as extra_id, 1 as visit_number, p.visit1_status as status, p.visit1_date as visit_date,
           p.visit1_expected as expected, p.visit1_discount_type as dtype, p.visit1_discount_value as dvalue
    from public.patients p where p.clinic_id = p_clinic
    union all
    select p.id, null, 2, p.visit2_status, p.visit2_date, p.visit2_expected, p.visit2_discount_type, p.visit2_discount_value
    from public.patients p where p.clinic_id = p_clinic
    union all
    select v.patient_id, v.id, null, v.status, v.visit_date, v.expected, v.discount_type, v.discount_value
    from public.patient_visits v where v.clinic_id = p_clinic
  ),
  extras as (
    select patient_id, extra_visit_id, visit_number, sum(total) as total
    from public.patient_extras where clinic_id = p_clinic group by 1, 2, 3
  ),
  paid as (
    select patient_id, extra_visit_id, visit_number, sum(amount) as amount
    from public.patient_payments where clinic_id = p_clinic group by 1, 2, 3
  ),
  balances as (
    select v.patient_id, v.status, v.visit_date, v.expected, v.dtype, v.dvalue,
           coalesce(e.total, 0) as extras, coalesce(pd.amount, 0) as paid
    from visits v
    left join extras e on e.patient_id = v.patient_id
      and (e.extra_visit_id = v.extra_id or (v.extra_id is null and e.extra_visit_id is null and e.visit_number = v.visit_number))
    left join paid pd on pd.patient_id = v.patient_id
      and (pd.extra_visit_id = v.extra_id or (v.extra_id is null and pd.extra_visit_id is null and pd.visit_number = v.visit_number))
  )
  select coalesce(array_agg(distinct b.patient_id), '{}')
  from balances b,
    lateral (select coalesce(b.expected, 0) + b.extras as base) x,
    lateral (
      select case
        when b.dtype is null or b.dvalue is null or b.dvalue <= 0 or x.base <= 0 then 0
        else round(least(b.dvalue, x.base), 2)
      end as off
    ) d
  where (b.paid > 0 or b.status = 'completed' or b.visit_date <= current_date + 2)
    and (b.dtype = 'percent'
      or abs((case when b.expected is null and b.extras = 0 then 0 else x.base - d.off end) - b.paid) > 0.001);
$$;
revoke execute on function public.patient_open_balance_ids(uuid) from public, anon;
grant execute on function public.patient_open_balance_ids(uuid) to authenticated;

-- ---------- one call for "who is viewing" (perf fix 4) ----------
-- What every clinic page needs about the signed-in person before anything else, in one round
-- trip instead of four in a row (profile, then permissions, then the clinic's modules, then
-- whether the clinic is active). Runs as the caller, so RLS decides exactly as those four
-- reads did: a deactivated member sees no profile row and gets null.
create or replace function public.viewer_context()
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when p.id is null then null else jsonb_build_object(
    'role', p.role,
    'roles', p.roles,
    'clinic_id', p.clinic_id,
    'display_name', p.display_name,
    'avatar_updated_at', p.avatar_updated_at,
    'permissions', to_jsonb(public.my_permissions()),
    'modules', (select to_jsonb(c.modules) from public.clinics c where c.id = p.clinic_id),
    'clinic_active', (select c.is_active from public.clinics c where c.id = p.clinic_id)
  ) end
  from (select 1) as one
  left join public.profiles p on p.id = auth.uid();
$$;
revoke execute on function public.viewer_context() from public, anon;
grant execute on function public.viewer_context() to authenticated;

-- Per responsible seller: how many patients, and how many confirmed from..to (to exclusive).
-- One query for the Sales performance table instead of two per seller. One JSON value, so
-- the API's 1,000-row cap never applies.
create or replace function public.patient_counts_by_seller(p_clinic uuid, p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(seller, jsonb_build_array(total, confirmed)), '{}')
  from (
    select responsible_seller_id as seller,
           count(*) as total,
           count(*) filter (where confirmation_date >= p_from and confirmation_date < p_to) as confirmed
    from public.patients
    where clinic_id = p_clinic and responsible_seller_id is not null
    group by 1
  ) x;
$$;
revoke execute on function public.patient_counts_by_seller(uuid, date, date) from public, anon;
grant execute on function public.patient_counts_by_seller(uuid, date, date) to authenticated;

-- ---------- RLS: check the caller once per query, not once per row ----------
-- The policy helpers (has_permission, my_clinic_id, is_active_profile, ...) are SECURITY
-- DEFINER, which Postgres never inlines, so a bare call in a policy runs again for every row
-- the query touches (~0.9 ms each: at 3,000 patients the patient pages hit the 8 s statement
-- timeout). Wrapped in a scalar sub-select, a call that only depends on the caller becomes an
-- InitPlan evaluated once per statement. Same result for every row, so the same access.
-- (Perf test 2026-09-26: identical reads and writes for 10 kinds of user, 3-10x faster.)
--
-- This stays the LAST section of the file on purpose: it rewrites whatever policies exist at
-- this point, so a policy added or changed above is covered on the next run without being
-- written twice. Already-wrapped calls are left alone, so re-running changes nothing.
-- Only calls whose arguments are the caller (auth.uid()) or constants are wrapped; a call
-- that takes a row column (e.g. is_clinic_seller(responsible_seller_id, ...)) stays per row.
create or replace function pg_temp.rls_once_per_query(expr text)
returns text
language sql
immutable
as $fn$
  select
    -- 5. any other helper that only takes the caller: f((select auth.uid())[, 'const'])
    regexp_replace(
    -- 4. support_can_write()
    regexp_replace(
    -- 3. bare auth.uid()
    regexp_replace(
    -- 2. zero-argument helpers
    regexp_replace(
    -- 1. the common helpers called with auth.uid() [and a constant]
    regexp_replace(expr,
      '\m(has_permission|is_active_profile|is_superadmin|is_admin)\(auth\.uid\(\)((, ''[^'']*''::text)?)\)',
      '(SELECT \1((SELECT auth.uid() AS uid)\2) AS ok)', 'g'),
      '(?<!SELECT )\m(my_clinic_id|support_clinic_id)\(\)',
      '(SELECT \1() AS cid)', 'g'),
      '(?<!SELECT )auth\.uid\(\)',
      '(SELECT auth.uid() AS uid)', 'g'),
      '(?<!SELECT )\msupport_can_write\(\)',
      '(SELECT support_can_write() AS ok)', 'g'),
      '(?<!SELECT )\m([a-z_]+)\(\( ?SELECT auth\.uid\(\) AS uid\)((, ''[^'']*''::text)?)\)',
      '(SELECT \1((SELECT auth.uid() AS uid)\2) AS ok)', 'g');
$fn$;

do $rls$
declare
  p record;
  q text;
  w text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
  loop
    q := pg_temp.rls_once_per_query(p.qual);
    w := pg_temp.rls_once_per_query(p.with_check);
    continue when q is not distinct from p.qual and w is not distinct from p.with_check;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then
      stmt := stmt || format(' using (%s)', q);
    end if;
    if p.with_check is not null then
      stmt := stmt || format(' with check (%s)', w);
    end if;
    execute stmt;
  end loop;
end;
$rls$;

drop function pg_temp.rls_once_per_query(text);
