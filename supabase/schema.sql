-- ==========================================================================
-- JamzieBites database (Supabase / Postgres)
-- Security model:
--   * The public (anon) can ONLY call submit_request() and public_status().
--     They have no direct access to any table.
--   * Only users listed in public.admins, signed in WITH 2FA (aal2), can read,
--     update or delete requests and settings. Enforced by Row Level Security.
-- Safe to re-run: drops and recreates functions/policies, keeps data.
-- ==========================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Shop settings (single row) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  status text not null default 'open' check (status in ('open','waitlist','closed')),
  slots_total int not null default 5 check (slots_total between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;
alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;
grant select on public.settings to authenticated;
grant update (status, slots_total) on public.settings to authenticated;
drop policy if exists "admin read settings" on public.settings;
drop policy if exists "admin update settings" on public.settings;
create policy "admin read settings" on public.settings for select to authenticated using (public.is_admin());
create policy "admin update settings" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Commission requests ----------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('JB-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  contact text not null check (char_length(contact) between 1 and 200),
  type text not null check (char_length(type) between 1 and 80),
  character_name text check (char_length(character_name) <= 200),
  refs text not null check (char_length(refs) between 1 and 3000),
  description text not null check (char_length(description) between 1 and 6000),
  deadline date,
  privacy text check (char_length(privacy) <= 120),
  nsfw boolean not null default false,
  adult_confirmed boolean not null default false,
  quote text check (char_length(quote) <= 3000),
  status text not null default 'new'
    check (status in ('new','accepted','paid','in_progress','done','declined','cancelled')),
  stage text not null default 'waiting'
    check (stage in ('waiting','sketch','lineart','color','render','done')),
  price numeric(10,2) check (price is null or price >= 0),
  queue_name text check (char_length(queue_name) <= 60),
  show_in_queue boolean not null default true,
  admin_notes text check (char_length(admin_notes) <= 6000),
  constraint nsfw_needs_adult check (not nsfw or adult_confirmed)
);
create index if not exists requests_created_idx on public.requests (created_at desc);
create index if not exists requests_status_idx on public.requests (status);
alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
grant select, delete on public.requests to authenticated;
grant update (status, stage, price, queue_name, show_in_queue, admin_notes) on public.requests to authenticated;
drop policy if exists "admin read requests" on public.requests;
drop policy if exists "admin update requests" on public.requests;
drop policy if exists "admin delete requests" on public.requests;
create policy "admin read requests" on public.requests for select to authenticated using (public.is_admin());
create policy "admin update requests" on public.requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete requests" on public.requests for delete to authenticated using (public.is_admin());

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists requests_touch on public.requests;
drop trigger if exists settings_touch on public.settings;
create trigger requests_touch before update on public.requests for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- ---------- PUBLIC: submit a request (the only way the public can write) ----------
create or replace function public.submit_request(
  p_name text, p_contact text, p_type text, p_character text, p_refs text, p_description text,
  p_deadline date, p_privacy text, p_nsfw boolean, p_adult boolean, p_quote text
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  -- Flood protection
  if (select count(*) from public.requests where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many requests right now — please try again in a few minutes.';
  end if;
  if (select count(*) from public.requests
        where lower(contact) = lower(trim(p_contact)) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You''ve already sent a few requests — please wait for a reply.';
  end if;
  if coalesce(p_nsfw, false) and not coalesce(p_adult, false) then
    raise exception 'NSFW requests need the 18+ confirmation.';
  end if;

  insert into public.requests (name, contact, type, character_name, refs, description, deadline,
                               privacy, nsfw, adult_confirmed, quote, queue_name, show_in_queue)
  values (trim(p_name), trim(p_contact), trim(p_type), nullif(trim(p_character), ''), trim(p_refs),
          trim(p_description), p_deadline, nullif(trim(p_privacy), ''), coalesce(p_nsfw, false),
          coalesce(p_adult, false), nullif(trim(p_quote), ''),
          case when coalesce(p_privacy, '') ilike 'public%' then left(trim(p_name), 60) else 'Anonymous' end,
          not (coalesce(p_privacy, '') ilike 'fully private%'))
  returning code into v_code;
  return v_code;
end $$;
revoke all on function public.submit_request(text,text,text,text,text,text,date,text,boolean,boolean,text) from public;
grant execute on function public.submit_request(text,text,text,text,text,text,date,text,boolean,boolean,text) to anon, authenticated;

-- ---------- PUBLIC: shop status + queue (no private details) ----------
create or replace function public.public_status() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'status', s.status,
    'slots_total', s.slots_total,
    'slots_taken', (select count(*) from public.requests r where r.status in ('accepted','paid','in_progress')),
    'queue', coalesce((
      select json_agg(json_build_object('client', coalesce(r.queue_name, 'Anonymous'), 'type', r.type, 'stage', r.stage)
                      order by r.created_at)
      from public.requests r
      where r.show_in_queue
        and (r.status in ('paid','in_progress') or (r.status = 'done' and r.updated_at > now() - interval '14 days'))
    ), '[]'::json)
  )
  from public.settings s where s.id = 1;
$$;
revoke all on function public.public_status() from public;
grant execute on function public.public_status() to anon, authenticated;
