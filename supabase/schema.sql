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

-- ---------- Payments (written ONLY by the stripe-webhook Edge Function) ----------
-- Stripe -> Edge Function (verifies Stripe's signature) -> record_stripe_payment().
-- Nobody on the website can call record_stripe_payment(); only the database owner
-- (which the Edge Function connects as) can.
alter table public.requests add column if not exists paid_amount numeric(10,2) not null default 0;
alter table public.requests add column if not exists paid_at timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stripe_session text not null unique check (char_length(stripe_session) <= 255),
  stripe_payment_intent text check (char_length(stripe_payment_intent) <= 255),
  livemode boolean not null default true,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'usd' check (char_length(currency) <= 10),
  code_given text check (char_length(code_given) <= 300),
  request_id uuid references public.requests(id) on delete set null,
  customer_name text check (char_length(customer_name) <= 200),
  customer_email text check (char_length(customer_email) <= 320),
  succeeded boolean not null default false,
  state text not null default 'processing' check (state in ('ok','attention','processing','failed')),
  note text check (char_length(note) <= 500),
  seen boolean not null default false
);
create index if not exists payments_created_idx on public.payments (created_at desc);
create index if not exists payments_request_idx on public.payments (request_id);
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant update (seen) on public.payments to authenticated;
drop policy if exists "admin read payments" on public.payments;
drop policy if exists "admin update payments" on public.payments;
create policy "admin read payments" on public.payments for select to authenticated using (public.is_admin());
create policy "admin update payments" on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

create or replace function public.record_stripe_payment(
  p_session text, p_intent text, p_livemode boolean, p_amount_cents bigint, p_currency text,
  p_ref text, p_custom text, p_name text, p_email text, p_result text  -- p_result: paid | processing | failed
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_prev public.payments%rowtype;
  v_req public.requests%rowtype;
  v_code text;
  v_cur text := lower(coalesce(nullif(trim(p_currency), ''), 'usd'));
  v_amount numeric(10,2) := round(greatest(coalesce(p_amount_cents, 0), 0) / 100.0, 2);
  v_total numeric(10,2);
  v_state text; v_note text;
begin
  if p_session is null or p_session = '' then raise exception 'missing session'; end if;
  if p_result not in ('paid', 'processing', 'failed') then raise exception 'bad result'; end if;

  -- Stripe can send the same event more than once: a payment is only ever counted once.
  select * into v_prev from public.payments where stripe_session = p_session for update;
  if v_prev.id is not null and v_prev.succeeded then return 'duplicate'; end if;

  -- Find the request code (JB-XXXXXX). The Pay page attaches it automatically;
  -- the text box at checkout is a backup.
  v_code := coalesce(substring(upper(coalesce(p_ref, '')) from 'JB-?[A-F0-9]{6}'),
                     substring(upper(coalesce(p_custom, '')) from 'JB-?[A-F0-9]{6}'));
  if v_code is not null and substr(v_code, 3, 1) <> '-' then v_code := 'JB-' || substr(v_code, 3); end if;
  if v_code is not null then
    select * into v_req from public.requests where code = v_code for update;
  end if;

  insert into public.payments (stripe_session, stripe_payment_intent, livemode, amount, currency, code_given,
                               request_id, customer_name, customer_email, succeeded)
  values (left(p_session, 255), left(p_intent, 255), coalesce(p_livemode, true), v_amount, left(v_cur, 10),
          left(trim(concat_ws(' · ', nullif(trim(p_ref), ''), nullif(trim(p_custom), ''))), 300),
          v_req.id, left(trim(p_name), 200), left(trim(p_email), 320), p_result = 'paid')
  on conflict (stripe_session) do update set
    stripe_payment_intent = coalesce(excluded.stripe_payment_intent, public.payments.stripe_payment_intent),
    amount = excluded.amount, currency = excluded.currency, request_id = excluded.request_id,
    customer_name = coalesce(excluded.customer_name, public.payments.customer_name),
    customer_email = coalesce(excluded.customer_email, public.payments.customer_email),
    succeeded = excluded.succeeded, seen = false;

  if p_result = 'failed' then
    v_state := 'failed'; v_note := 'This payment didn''t go through, so nothing was changed.';
  elsif p_result = 'processing' then
    v_state := 'processing'; v_note := 'Still processing (Klarna / Cash App can take a moment). This updates by itself.';
  elsif v_req.id is null then
    v_state := 'attention';
    v_note := case when v_code is null
      then 'No request code was attached, so it couldn''t be matched. Find their request and mark it paid by hand.'
      else 'No request has the code ' || v_code || '. Check the code with the client, then mark the right request paid.' end;
  else
    select coalesce(sum(p.amount), 0) into v_total from public.payments p
      where p.request_id = v_req.id and p.succeeded and p.currency = 'usd';
    update public.requests set paid_amount = v_total where id = v_req.id;

    if v_cur <> 'usd' then
      v_state := 'attention'; v_note := 'Paid in ' || upper(v_cur) || ' instead of USD. Check it in Stripe.';
    elsif v_req.status in ('declined', 'cancelled') then
      v_state := 'attention'; v_note := 'This request was ' || v_req.status || '. You may want to refund it in Stripe.';
    elsif v_req.status in ('paid', 'in_progress', 'done') then
      v_state := 'attention'; v_note := 'This request was already paid, so this is an extra payment (a tip or a duplicate?).';
    elsif v_req.price is null then
      v_state := 'attention';
      v_note := 'Paid before a final price was set. Set the price, then click Mark paid if the amount is right.';
    elsif v_total >= v_req.price then
      update public.requests
        set status = 'paid', paid_at = now(), stage = case when stage = 'done' then 'waiting' else stage end
        where id = v_req.id;
      v_state := 'ok'; v_note := 'Marked paid automatically and added to the public queue.';
    else
      v_state := 'attention';
      v_note := 'Paid $' || to_char(v_total, 'FM999999990.00') || ' of $' || to_char(v_req.price, 'FM999999990.00')
             || ', so $' || to_char(v_req.price - v_total, 'FM999999990.00') || ' is still owed. Not marked paid yet.';
    end if;
  end if;

  update public.payments set state = v_state, note = v_note where stripe_session = p_session;
  return v_state;
end $$;
revoke all on function public.record_stripe_payment(text,text,boolean,bigint,text,text,text,text,text,text) from public, anon, authenticated;
