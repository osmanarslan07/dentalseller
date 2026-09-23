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
