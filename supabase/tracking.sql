-- ==========================================================================
-- JamzieBites: "where did this client find me?" (free, no cookies, no tracking
-- scripts). The site remembers a short label like "tiktok" from a tagged link
-- (jamziebites.com/?from=tiktok) or from the referring site, and sends it with
-- the request. Jamzie sees it in the studio and in her new-request DM.
-- Safe to re-run.
-- ==========================================================================

alter table public.requests add column if not exists source text
  check (source is null or source ~ '^[a-z0-9._-]{1,40}$');

-- The label is handed over through a transaction-local setting, so the row is
-- inserted with it (and the new-request alert can show it).
alter table public.requests alter column source set default nullif(current_setting('jb.source', true), '');

create or replace function public.submit_request4(
  p_name text, p_email text, p_discord text, p_type text, p_character text, p_refs text, p_description text,
  p_deadline date, p_privacy text, p_nsfw boolean, p_adult boolean, p_quote text, p_has_character text, p_source text
) returns json
language plpgsql security definer set search_path = '' as $$
declare v_src text := left(nullif(regexp_replace(lower(coalesce(p_source, '')), '[^a-z0-9._-]', '', 'g'), ''), 40);
begin
  perform set_config('jb.source', coalesce(v_src, ''), true);
  return public.submit_request3(p_name, p_email, p_discord, p_type, p_character, p_refs, p_description,
                                p_deadline, p_privacy, p_nsfw, p_adult, p_quote, p_has_character);
end $$;
revoke all on function public.submit_request4(text,text,text,text,text,text,text,date,text,boolean,boolean,text,text,text) from public;
grant execute on function public.submit_request4(text,text,text,text,text,text,text,date,text,boolean,boolean,text,text,text) to anon, authenticated;

-- 🆕 New request alert now says where they found her
create or replace function public.alert_new_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.owner_alert('🆕 **New commission request** from **' || new.name || '**: ' || new.type ||
    coalesce(' of ' || new.character_name, '') || ' (' || new.code || ')' ||
    case when new.nsfw then ' · 🔞 NSFW' else '' end ||
    case when new.has_character = 'design' then ' · needs a new character design' else '' end ||
    case when new.status = 'paid' then ' · already marked paid' else '' end ||
    case when new.source is not null then ' · found you via **' || new.source || '**' else '' end, new.id);
  return new;
end $$;
