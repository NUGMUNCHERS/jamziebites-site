-- ==========================================================================
-- JamzieBites: Discord DMs to Jamzie herself for everything that happens.
-- New requests, payments/tips, client messages, undelivered client updates.
-- The "notify" Edge Function sends them from her bot. Safe to re-run.
-- ==========================================================================

-- Who to DM: looked up once by her Discord name, then pinned by account ID.
alter table public.settings add column if not exists owner_discord text check (char_length(owner_discord) <= 64);
alter table public.settings add column if not exists owner_discord_id text check (owner_discord_id is null or owner_discord_id ~ '^[0-9]{5,25}$');
alter table public.settings add column if not exists owner_discord_found text check (char_length(owner_discord_found) <= 200);

create table if not exists public.owner_alerts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  text text not null check (char_length(text) between 1 and 1800),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0,
  next_try_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text check (char_length(last_error) <= 500)
);
create index if not exists owner_alerts_due_idx on public.owner_alerts (next_try_at) where status = 'pending';
alter table public.owner_alerts enable row level security;
revoke all on public.owner_alerts from anon, authenticated;
grant select on public.owner_alerts to authenticated;
drop policy if exists "admin read owner alerts" on public.owner_alerts;
create policy "admin read owner alerts" on public.owner_alerts for select to authenticated using (public.is_admin());

create or replace function public.owner_alert(p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.owner_alerts (text) values (left(p_text, 1800));
  perform public.kick_notifier();
end $$;
revoke all on function public.owner_alert(text) from public, anon, authenticated;

-- 🆕 New request
create or replace function public.alert_new_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.owner_alert('🆕 **New commission request** from **' || new.name || '**: ' || new.type ||
    coalesce(' of ' || new.character_name, '') || ' (' || new.code || ')' ||
    case when new.nsfw then ' · 🔞 NSFW' else '' end ||
    case when new.has_character = 'design' then ' · needs a new character design' else '' end ||
    case when new.status = 'paid' then ' · already marked paid' else '' end);
  return new;
end $$;
revoke all on function public.alert_new_request() from public, anon, authenticated;
drop trigger if exists requests_alert_owner on public.requests;
create trigger requests_alert_owner after insert on public.requests for each row execute function public.alert_new_request();

-- 💳 Payments & tips (fires once a payment is confirmed or flagged)
create or replace function public.alert_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.state not in ('ok', 'attention') or not new.succeeded then return new; end if;
  if tg_op = 'UPDATE' and old.state is not distinct from new.state and old.succeeded is not distinct from new.succeeded then return new; end if;
  select name, code into r from public.requests where id = new.request_id;
  perform public.owner_alert(
    case when new.state = 'attention' then '⚠️ **Payment needs a look:** ' else '💳 **Payment received:** ' end ||
    '$' || to_char(new.amount, 'FM999999990.00') || ' from ' || coalesce(nullif(new.customer_name, ''), 'someone') ||
    case when r.code is not null then ' for **' || r.name || '** (' || r.code || ')'
         when upper(coalesce(new.code_given, '')) like 'TIP%' then ' · 💝 a tip!'
         else '' end ||
    case when new.note is not null then E'\n' || new.note else '' end);
  return new;
end $$;
revoke all on function public.alert_payment() from public, anon, authenticated;
drop trigger if exists payments_alert_owner on public.payments;
create trigger payments_alert_owner after insert or update of state, succeeded on public.payments
  for each row execute function public.alert_payment();

-- 💬 Client messages
create or replace function public.alert_client_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; nfiles int := jsonb_array_length(coalesce(new.files, '[]'::jsonb));
begin
  if new.sender <> 'client' then return new; end if;
  select name, code into r from public.requests where id = new.request_id;
  perform public.owner_alert('💬 **' || coalesce(r.name, 'A client') || '** sent a message (' || coalesce(r.code, '?') || ')' ||
    case when nfiles > 0 then ' with ' || nfiles || ' file' || case when nfiles > 1 then 's' else '' end else '' end ||
    case when coalesce(new.body, '') <> '' then E'\n> ' || replace(left(new.body, 300), E'\n', E'\n> ') else '' end);
  return new;
end $$;
revoke all on function public.alert_client_message() from public, anon, authenticated;
drop trigger if exists messages_alert_owner on public.messages;
create trigger messages_alert_owner after insert on public.messages for each row execute function public.alert_client_message();

-- ⚠️ A client update couldn't be delivered (after all retries)
create or replace function public.alert_undelivered() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.status <> 'failed' or old.status = 'failed' then return new; end if;
  select name, code into r from public.requests where id = new.request_id;
  perform public.owner_alert('⚠️ Couldn''t send **' || coalesce(r.name, 'a client') || '** (' || coalesce(r.code, '?') || ') their "' ||
    new.kind || '" update by ' || new.channel || '. ' || coalesce(new.last_error, '') ||
    E'\nYou can hit "Send again" in the studio or message them yourself.');
  return new;
end $$;
revoke all on function public.alert_undelivered() from public, anon, authenticated;
drop trigger if exists notifications_alert_owner on public.notifications;
create trigger notifications_alert_owner after update of status on public.notifications
  for each row execute function public.alert_undelivered();

-- Retry timer also covers owner alerts.
select cron.schedule('jb-notify-retry', '* * * * *',
  $c$select public.kick_notifier() where exists (select 1 from public.notifications where status = 'pending' and next_try_at <= now())
                                      or exists (select 1 from public.owner_alerts where status = 'pending' and next_try_at <= now())$c$);
