-- Save Life ticket-check: Supabase schema + RLS policies.
-- Execute this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'pending'
    check (role in ('pending', 'verifier', 'generator', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_by_email text not null default '',
  count integer not null default 0
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  secret text not null,
  holder_name text not null,
  category text not null check (category in ('VVIP', 'VIP', 'STANDARD')),
  email text not null default '',
  phone text not null default '',
  reference text not null default '',
  reference_key text not null default '',
  seat text not null default '',
  batch_id uuid references public.batches(id) on delete set null,
  status text not null default 'valid' check (status in ('valid', 'used')),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  scan_count integer not null default 0,
  first_scan_at timestamptz,
  first_scan_by uuid references public.profiles(id),
  first_scan_by_email text
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  at timestamptz not null default now(),
  by uuid not null references public.profiles(id),
  by_email text not null default '',
  result text not null check (result in ('admitted', 'already_used'))
);

create index if not exists idx_batches_created_at on public.batches(created_at desc);
create index if not exists idx_tickets_batch_id on public.tickets(batch_id);
create index if not exists idx_tickets_reference_key on public.tickets(reference_key);
create index if not exists idx_tickets_category_status on public.tickets(category, status);
create index if not exists idx_tickets_status on public.tickets(status);
create index if not exists idx_scans_at on public.scans(at desc);
create index if not exists idx_scans_ticket_id on public.scans(ticket_id);
create index if not exists idx_scans_result on public.scans(result);

alter table public.profiles enable row level security;
alter table public.batches enable row level security;
alter table public.tickets enable row level security;
alter table public.scans enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $current_user_role$
  select role from public.profiles where id = auth.uid()
$current_user_role$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_admin$
  select coalesce(public.current_user_role() = 'admin', false)
$is_admin$;

create or replace function public.is_generator()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_generator$
  select coalesce(public.current_user_role() in ('generator', 'admin'), false)
$is_generator$;

create or replace function public.is_verifier()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_verifier$
  select coalesce(public.current_user_role() in ('verifier', 'admin'), false)
$is_verifier$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_staff$
  select coalesce(public.current_user_role() in ('admin', 'generator', 'verifier'), false)
$is_staff$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert
to authenticated
with check (id = auth.uid() and role = 'pending');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
for update
to authenticated
using (public.is_admin())
with check (role in ('pending', 'verifier', 'generator', 'admin'));

drop policy if exists batches_select_staff on public.batches;
create policy batches_select_staff on public.batches
for select
to authenticated
using (public.is_staff());

drop policy if exists batches_insert_generator on public.batches;
create policy batches_insert_generator on public.batches
for insert
to authenticated
with check (public.is_generator() and created_by = auth.uid());

drop policy if exists batches_update_admin on public.batches;
create policy batches_update_admin on public.batches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists batches_delete_admin on public.batches;
create policy batches_delete_admin on public.batches
for delete
to authenticated
using (public.is_admin());

drop policy if exists tickets_select_staff on public.tickets;
create policy tickets_select_staff on public.tickets
for select
to authenticated
using (public.is_staff());

drop policy if exists tickets_insert_generator on public.tickets;
create policy tickets_insert_generator on public.tickets
for insert
to authenticated
with check (
  public.is_generator()
  and created_by = auth.uid()
  and status = 'valid'
  and scan_count = 0
  and category in ('VVIP', 'VIP', 'STANDARD')
);

drop policy if exists tickets_update_admin on public.tickets;
create policy tickets_update_admin on public.tickets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists tickets_delete_admin on public.tickets;
create policy tickets_delete_admin on public.tickets
for delete
to authenticated
using (public.is_admin());

drop policy if exists scans_select_staff on public.scans;
create policy scans_select_staff on public.scans
for select
to authenticated
using (public.is_staff());

drop policy if exists scans_insert_verifier on public.scans;
create policy scans_insert_verifier on public.scans
for insert
to authenticated
with check (public.is_verifier() and by = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $handle_new_user$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1), 'Utilisateur'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$handle_new_user$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.scan_ticket(p_ticket_id uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $scan_ticket$
declare
  v_role text;
  v_ticket public.tickets%rowtype;
  v_now timestamptz := now();
  v_scan_count integer;
  v_email text;
begin
  select role, email into v_role, v_email
  from public.profiles
  where id = auth.uid();

  if coalesce(v_role, '') not in ('verifier', 'admin') then
    raise exception 'not_allowed';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_ticket.secret <> p_secret then
    return jsonb_build_object('result', 'invalid');
  end if;

  v_scan_count := coalesce(v_ticket.scan_count, 0) + 1;

  if v_ticket.status = 'valid' then
    update public.tickets
    set
      status = 'used',
      scan_count = v_scan_count,
      first_scan_at = v_now,
      first_scan_by = auth.uid(),
      first_scan_by_email = coalesce(v_email, '')
    where id = p_ticket_id
    returning * into v_ticket;

    insert into public.scans (ticket_id, at, by, by_email, result)
    values (p_ticket_id, v_now, auth.uid(), coalesce(v_email, ''), 'admitted');

    return jsonb_build_object(
      'result', 'admitted',
      'ticket', to_jsonb(v_ticket),
      'scanCount', v_scan_count
    );
  end if;

  update public.tickets
  set scan_count = v_scan_count
  where id = p_ticket_id
  returning * into v_ticket;

  insert into public.scans (ticket_id, at, by, by_email, result)
  values (p_ticket_id, v_now, auth.uid(), coalesce(v_email, ''), 'already_used');

  return jsonb_build_object(
    'result', 'already_used',
    'ticket', to_jsonb(v_ticket),
    'firstScanAt', v_ticket.first_scan_at,
    'firstScanByEmail', v_ticket.first_scan_by_email,
    'scanCount', v_scan_count
  );
end;
$scan_ticket$;

create or replace function public.event_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $event_stats$
declare
  v_role text;
  v_total integer;
  v_used integer;
  v_refused integer;
  v_by_category jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if coalesce(v_role, '') not in ('admin', 'generator', 'verifier') then
    raise exception 'not_allowed';
  end if;

  select count(*)::integer into v_total from public.tickets;
  select count(*)::integer into v_used from public.tickets where status = 'used';
  select count(*)::integer into v_refused from public.scans where result = 'already_used';

  with cats(id) as (
    values ('VVIP'), ('VIP'), ('STANDARD')
  ),
  stats as (
    select
      cats.id,
      count(t.id)::integer as total,
      count(t.id) filter (where t.status = 'used')::integer as used
    from cats
    left join public.tickets t on t.category = cats.id
    group by cats.id
  )
  select jsonb_object_agg(
    id,
    jsonb_build_object(
      'id', id,
      'total', total,
      'used', used,
      'remaining', total - used
    )
  )
  into v_by_category
  from stats;

  return jsonb_build_object(
    'total', v_total,
    'used', v_used,
    'remaining', v_total - v_used,
    'byCategory', coalesce(v_by_category, '{}'::jsonb),
    'scansTotal', v_used + v_refused,
    'admittedScans', v_used,
    'refusedScans', v_refused
  );
end;
$event_stats$;

-- Realtime: in Supabase Dashboard, enable replication for public.scans
-- if you want instant activity feed updates.
