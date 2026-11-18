-- ==========================================================================
-- JamzieBites: two-way replies. Safe to re-run.
--  * Client replies to any JamzieBites email land in the request's message thread
--    ("inbound-email" Edge Function, fed by Resend's email.received webhook).
--  * Jamzie's Discord alerts get a "Reply" button; clients' Discord DMs too
--    ("discord-interactions" Edge Function).
--  * Every message Jamzie sends is emailed / DM'd to the client with the text in it.
-- ==========================================================================

-- ---------- Alerts can point at a request (for the Reply button) ----------
alter table public.owner_alerts add column if not exists request_id uuid references public.requests(id) on delete set null;

create or replace function public.owner_alert(p_text text, p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.owner_alerts (text, request_id) values (left(p_text, 1800), p_request);
  perform public.kick_notifier();
end $$;
revoke all on function public.owner_alert(text, uuid) from public, anon, authenticated;

create or replace function public.owner_alert(p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.owner_alert(p_text, null::uuid);
end $$;
revoke all on function public.owner_alert(text) from public, anon, authenticated;

-- 🆕 New request (now with a Reply button)
create or replace function public.alert_new_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.owner_alert('🆕 **New commission request** from **' || new.name || '**: ' || new.type ||
    coalesce(' of ' || new.character_name, '') || ' (' || new.code || ')' ||
    case when new.nsfw then ' · 🔞 NSFW' else '' end ||
    case when new.has_character = 'design' then ' · needs a new character design' else '' end ||
    case when new.status = 'paid' then ' · already marked paid' else '' end, new.id);
  return new;
end $$;

-- 💳 Payments & tips
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
    case when new.note is not null then E'\n' || new.note else '' end, new.request_id);
  return new;
end $$;

-- 💬 Client messages: the full text (up to ~1200 chars) + a Reply button
create or replace function public.alert_client_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; nfiles int := jsonb_array_length(coalesce(new.files, '[]'::jsonb));
begin
  if new.sender <> 'client' then return new; end if;
  select name, code into r from public.requests where id = new.request_id;
  perform public.owner_alert('💬 **' || coalesce(r.name, 'A client') || '** sent a message (' || coalesce(r.code, '?') || ')' ||
    case when nfiles > 0 then ' with ' || nfiles || ' file' || case when nfiles > 1 then 's' else '' end else '' end ||
    case when coalesce(new.body, '') <> '' then E'\n> ' || replace(left(new.body, 1200), E'\n', E'\n> ') ||
         case when char_length(new.body) > 1200 then E'\n> …' else '' end else '' end, new.request_id);
  return new;
end $$;

-- ⚠️ Undelivered client update (now with a Reply button)
create or replace function public.alert_undelivered() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.status <> 'failed' or old.status = 'failed' then return new; end if;
  select name, code into r from public.requests where id = new.request_id;
  perform public.owner_alert('⚠️ Couldn''t send **' || coalesce(r.name, 'a client') || '** (' || coalesce(r.code, '?') || ') their "' ||
    new.kind || '" update by ' || new.channel || '. ' || coalesce(new.last_error, '') ||
    E'\nYou can hit "Send again" in the studio or message them yourself.', new.request_id);
  return new;
end $$;

-- ---------- Message pings to the client: one per message, text included ----------
-- (Only skip when a ping is still waiting to go out: that one will carry this message too.)
create or replace function public.queue_message_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.sender <> 'artist' then return new; end if;
  select email, discord into r from public.requests where id = new.request_id;
  if r.email is null and r.discord is null then return new; end if;
  if exists (select 1 from public.notifications n
              where n.request_id = new.request_id and n.kind = 'message'
                and n.status = 'pending' and n.attempts = 0) then
    return new;
  end if;
  if r.email is not null then insert into public.notifications (request_id, kind, channel) values (new.request_id, 'message', 'email'); end if;
  if r.discord is not null then insert into public.notifications (request_id, kind, channel) values (new.request_id, 'message', 'discord'); end if;
  perform public.kick_notifier();
  return new;
end $$;

-- ---------- Emails that came in (each processed once) ----------
create table if not exists public.inbound_emails (
  email_id text primary key check (char_length(email_id) <= 100),
  received_at timestamptz not null default now(),
  request_id uuid references public.requests(id) on delete set null,
  outcome text check (char_length(outcome) <= 300)
);
alter table public.inbound_emails enable row level security;
revoke all on public.inbound_emails from anon, authenticated;
grant select on public.inbound_emails to authenticated;
drop policy if exists "admin read inbound emails" on public.inbound_emails;
create policy "admin read inbound emails" on public.inbound_emails for select to authenticated using (public.is_admin());
