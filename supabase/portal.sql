-- ==========================================================================
-- JamzieBites: client portal (messages + private files) and the
-- "do you already have a character?" question. Safe to re-run.
-- ==========================================================================

-- Tighten: old/internal functions nobody outside should call.
revoke all on function public.submit_request(text,text,text,text,text,text,date,text,boolean,boolean,text) from public, anon, authenticated;
revoke all on function public.queue_client_messages() from public, anon, authenticated;
revoke all on function public.reset_discord_id() from public, anon, authenticated;

-- ---------- Character question ----------
alter table public.requests add column if not exists has_character text
  check (has_character is null or has_character in ('yes', 'design'));

-- ---------- Messages between Jamzie and a client ----------
-- files: [{ "path": "requests/<request id>/<client|artist>/<uuid>-name.png", "name": "...", "size": 123, "type": "image/png" }]
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  request_id uuid not null references public.requests(id) on delete cascade,
  sender text not null check (sender in ('client', 'artist')),
  body text check (char_length(body) <= 4000),
  files jsonb not null default '[]'::jsonb
    check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 10),
  read_by_artist boolean not null default false,
  constraint message_not_empty check (char_length(coalesce(body, '')) > 0 or jsonb_array_length(files) > 0)
);
create index if not exists messages_request_idx on public.messages (request_id, created_at);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select, insert, delete on public.messages to authenticated;
grant update (read_by_artist) on public.messages to authenticated;
drop policy if exists "admin read messages" on public.messages;
drop policy if exists "admin write messages" on public.messages;
drop policy if exists "admin update messages" on public.messages;
drop policy if exists "admin delete messages" on public.messages;
create policy "admin read messages" on public.messages for select to authenticated using (public.is_admin());
-- Jamzie can only post as the artist; client messages arrive through the "portal" Edge Function.
create policy "admin write messages" on public.messages for insert to authenticated with check (public.is_admin() and sender = 'artist');
create policy "admin update messages" on public.messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete messages" on public.messages for delete to authenticated using (public.is_admin());

-- ---------- Private file storage ----------
-- Private bucket: nothing is public. Clients get short-lived signed links from the
-- "portal" Edge Function (only for their own request); Jamzie reads/writes as admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal', 'portal', false, 26214400,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf','application/zip','application/x-zip-compressed'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "jb admin portal files" on storage.objects;
create policy "jb admin portal files" on storage.objects for all to authenticated
  using (bucket_id = 'portal' and public.is_admin())
  with check (bucket_id = 'portal' and public.is_admin());

-- ---------- Ping the client when Jamzie sends a message ----------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('received','accepted','paid','started','done','declined','message'));

create or replace function public.queue_message_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.sender <> 'artist' then return new; end if;
  select email, discord into r from public.requests where id = new.request_id;
  if r.email is null and r.discord is null then return new; end if;
  -- Several messages in a row -> one ping, not a flood.
  if exists (select 1 from public.notifications n
              where n.request_id = new.request_id and n.kind = 'message'
                and (n.status = 'pending' or n.created_at > now() - interval '10 minutes')) then
    return new;
  end if;
  if r.email is not null then insert into public.notifications (request_id, kind, channel) values (new.request_id, 'message', 'email'); end if;
  if r.discord is not null then insert into public.notifications (request_id, kind, channel) values (new.request_id, 'message', 'discord'); end if;
  perform public.kick_notifier();
  return new;
end $$;
revoke all on function public.queue_message_notice() from public, anon, authenticated;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.queue_message_notice();

-- ---------- PUBLIC: submit a request (adds the character question) ----------
create or replace function public.submit_request3(
  p_name text, p_email text, p_discord text, p_type text, p_character text, p_refs text, p_description text,
  p_deadline date, p_privacy text, p_nsfw boolean, p_adult boolean, p_quote text, p_has_character text
) returns json
language plpgsql security definer set search_path = '' as $$
declare j json; v_has text := case when p_has_character in ('yes', 'design') then p_has_character else null end;
begin
  j := public.submit_request2(p_name, p_email, p_discord, p_type, p_character,
         coalesce(nullif(trim(coalesce(p_refs, '')), ''), case when v_has = 'design' then '(new character design)' else '(see attached files)' end),
         p_description, p_deadline, p_privacy, p_nsfw, p_adult, p_quote);
  update public.requests set has_character = v_has where code = j ->> 'code';
  return j;
end $$;
revoke all on function public.submit_request3(text,text,text,text,text,text,text,date,text,boolean,boolean,text,text) from public;
grant execute on function public.submit_request3(text,text,text,text,text,text,text,date,text,boolean,boolean,text,text) to anon, authenticated;
