-- ============================================================
-- FesGH — Supabase schema
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Profiles (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  bio text not null default '',
  avatar int not null default 0,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;

-- Public avatars bucket (run once; storage policies below)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Community parties posted by users
create table if not exists public.parties (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  host text not null default '',
  date text,
  location text,
  price numeric not null default 0,
  capacity text,
  description text,
  category text not null default 'Kickback',
  rsvps int not null default 0,
  is_user boolean not null default true,
  created_at timestamptz not null default now()
);

-- Reviews written by users
create table if not exists public.reviews (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  party_name text not null,
  rating int not null check (rating between 1 and 5),
  title text,
  comment text,
  author text,
  date text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Host ticket designs live on the party row (hosts build their own
-- tickets in the designer — preset, background image, editable lines).
-- tickets_sold is kept accurate by a trigger on ticket_purchases.
alter table public.parties add column if not exists ticket_design jsonb;
alter table public.parties add column if not exists tickets_sold int not null default 0;

-- Party model: HOSTS post parties (the party organizers) — their rows
-- have no affiliate_id and sit in the pool on the Affiliate page until an
-- approved AFFILIATE reposts them. A repost is a copy of the host's party
-- with the affiliate's own price + ticket design:
--   affiliate_id     = the reposter (keeps 70% of their price margin)
--   host_id          = the original poster (keeps 70% of the base price)
--   source_party_id  = the host party this repost copies
--   price            = the repost's sale price (what the buyer pays)
--   original_price   = the host's base price that repost marks up from
alter table public.parties add column if not exists status text not null default 'live';
alter table public.parties add column if not exists affiliate_id uuid references auth.users (id) on delete set null;
alter table public.parties add column if not exists host_id uuid references auth.users (id) on delete set null;
alter table public.parties add column if not exists source_party_id text;
alter table public.parties add column if not exists original_price numeric not null default 0;
create index if not exists parties_status on public.parties (status, created_at desc);
-- One repost per affiliate per party — an affiliate can't double-list.
create unique index if not exists parties_repost_unique
  on public.parties (affiliate_id, source_party_id)
  where affiliate_id is not null and source_party_id is not null;

-- Purchased tickets (one row per pass). party_id links a pass to a
-- hosted party's ticket design; hash is the unique per-ticket value
-- shown to the buyer and logged for the host. design is the snapshot
-- of the ticket design the host made, so old passes keep their look.
create table if not exists public.tickets (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ticket_id text,
  party_id text,
  hash text,
  design jsonb,
  name text not null,
  date text,
  location text,
  price numeric not null default 0,
  commission numeric not null default 0,
  holder text,
  created_at timestamptz not null default now()
);

alter table public.tickets add column if not exists party_id text;
alter table public.tickets add column if not exists hash text;
alter table public.tickets add column if not exists design jsonb;
alter table public.tickets add column if not exists promo_used jsonb;
alter table public.tickets add column if not exists commission numeric not null default 0;

-- Hosts' sales log: one row per pass sold on a host's party ticket.
-- Hosts read this to see every buyer (name / email / phone) and the
-- unique ticket hash generated for their pass. Buyers can also see
-- their own rows.
create table if not exists public.ticket_purchases (
  id uuid primary key default gen_random_uuid(),
  party_id text not null,
  host_id uuid not null references auth.users (id) on delete cascade,
  buyer_id uuid references auth.users (id) on delete set null,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  code text,
  hash text not null,
  price numeric not null default 0,
  commission numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ticket_purchases_host on public.ticket_purchases (host_id, created_at desc);
alter table public.ticket_purchases add column if not exists commission numeric not null default 0;
-- The reposting affiliate who drove the sale (keeps 70% of their price
-- margin). host_id above is always the ORIGINAL party host (70% of the
-- base price); affiliate_id is the reposter, so their dashboard can log
-- every sale they drove. original_price is the host's base price the
-- repost marked up from, and payment_reference is the Paystack charge.
alter table public.ticket_purchases add column if not exists affiliate_id uuid references auth.users (id) on delete set null;
alter table public.ticket_purchases add column if not exists original_price numeric not null default 0;
alter table public.ticket_purchases add column if not exists payment_reference text;
create index if not exists ticket_purchases_affiliate on public.ticket_purchases (affiliate_id, created_at desc);

-- Keep each party's tickets_sold counter accurate whenever a pass is
-- sold. Runs as the table owner so RLS (the buyer owns the insert)
-- never blocks it.
create or replace function public.sync_ticket_sales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.parties set tickets_sold = tickets_sold + 1 where id = new.party_id;
  return null;
end;
$$;

drop trigger if exists ticket_purchases_sales on public.ticket_purchases;
create trigger ticket_purchases_sales
  after insert on public.ticket_purchases
  for each row execute function public.sync_ticket_sales();

-- RSVPs (which parties the user is going to)
create table if not exists public.going (
  user_id uuid not null references auth.users (id) on delete cascade,
  party_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, party_id)
);

-- Keep each party's rsvps counter accurate whenever anyone RSVPs or
-- pulls out. Runs as the table owner so RLS never blocks it.
create or replace function public.sync_party_rsvps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.parties set rsvps = rsvps + 1 where id = new.party_id;
  elsif (tg_op = 'DELETE') then
    update public.parties set rsvps = greatest(0, rsvps - 1) where id = old.party_id;
  end if;
  return null;
end;
$$;

drop trigger if exists going_rsvps on public.going;
create trigger going_rsvps
  after insert or delete on public.going
  for each row execute function public.sync_party_rsvps();

-- Auto-create a profile row when someone signs up (email or Google).
-- For Google users the name + photo (avatar_url) come from the OAuth
-- metadata, so their profile is ready immediately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Affiliate hosts: users approved to post events and sell tickets at
-- their own prices. Applying costs a one-time 40 GHS fee (paid via
-- Paystack before the application is submitted; fee_reference records
-- the charge). Every sale splits as:
--   30% platform (30% of the host's base price + 30% of the affiliate's
--   margin) · host keeps 70% of their base · affiliate keeps 70% of
--   their margin.
-- Defined up here (before RLS) because the parties policies reference it.
create table if not exists public.affiliates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  commission_pct numeric not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.affiliates add column if not exists fee_paid boolean not null default false;
alter table public.affiliates add column if not exists fee_reference text;
alter table public.affiliates add column if not exists fee_amount numeric not null default 40;

-- A paid application must carry its Paystack reference — no "paid"
-- row without proof of which charge settled it.
alter table public.affiliates drop constraint if exists affiliates_fee_consistency;
alter table public.affiliates add constraint affiliates_fee_consistency
  check (not fee_paid or fee_reference is not null);

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.parties enable row level security;
alter table public.reviews enable row level security;
alter table public.tickets enable row level security;
alter table public.going enable row level security;
alter table public.ticket_purchases enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "parties_select" on public.parties;
create policy "parties_select" on public.parties
  for select using (
    status = 'live'
    or auth.uid() = user_id
    or exists (
      select 1 from public.affiliates a
      where a.user_id = auth.uid() and a.status = 'approved'
    )
  );

-- Party lifecycle: hosts post parties straight into the pool ('live' rows
-- with no affiliate_id), and approved affiliates repost them with their
-- own price. Only approved affiliates may carry affiliate_id / a source
-- party — anyone else gets those stripped so their row stays a host
-- original. The trigger also pins a repost's HOST attribution and the
-- host's ORIGINAL_PRICE to the original party on insert (resolving both
-- from source_party_id) and freezes them on every update — so the split
-- (platform 30% · host 70% of base · affiliate 70% of margin) can never
-- be rerouted or re-anchored by the reposter.
create or replace function public.enforce_party_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_affiliate boolean;
  src_user uuid;
  src_price numeric;
begin
  is_affiliate := exists (
    select 1 from public.affiliates a
    where a.user_id = auth.uid() and a.status = 'approved'
  );

  if (new.status is null) then
    new.status := 'live';
  end if;

  if not is_affiliate then
    -- Hosts (and anyone else) can't mark a party as a repost — strip the
    -- repost fields so it stays a host original in the pool. But ONLY
    -- when the row is being created, or the repost fields are actually
    -- being (re)assigned on an UPDATE. Background counter bumps
    -- (tickets_sold from a sale, rsvps from an RSVP — both fired by
    -- security-definer triggers running under the *buyer/RSVP-er's*
    -- auth context) touch none of those fields, so an existing repost
    -- keeps its attribution. Otherwise one ticket sale would strip the
    -- affiliate_id and the listing would vanish from Events for everyone.
    if (tg_op = 'INSERT') then
      new.affiliate_id := null;
      new.source_party_id := null;
      new.host_id := null;
      new.original_price := 0;
    elsif (new.affiliate_id is distinct from old.affiliate_id
           or new.source_party_id is distinct from old.source_party_id) then
      new.affiliate_id := null;
      new.source_party_id := null;
      new.host_id := null;
      new.original_price := 0;
    end if;
  elsif (new.source_party_id is not null and new.affiliate_id is not null) then
    -- Approved affiliate reposting: resolve the host + base price from
    -- the original party on insert, freeze both on every update.
    if (tg_op = 'INSERT') then
      select user_id, price into src_user, src_price
        from public.parties where id = new.source_party_id;
      new.host_id := src_user;
      new.original_price := coalesce(src_price, 0);
    else
      new.host_id := old.host_id;
      new.original_price := old.original_price;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists parties_lifecycle on public.parties;
create trigger parties_lifecycle
  before insert or update on public.parties
  for each row execute function public.enforce_party_lifecycle();

drop policy if exists "parties_insert" on public.parties;
create policy "parties_insert" on public.parties
  for insert with check (auth.uid() = user_id);

drop policy if exists "parties_update" on public.parties;
create policy "parties_update" on public.parties
  for update using (
    auth.uid() = user_id
    or auth.uid() = affiliate_id
  )
  with check (auth.uid() = user_id or auth.uid() = affiliate_id);

drop policy if exists "reviews_select" on public.reviews;
create policy "reviews_select" on public.reviews
  for select using (true);

drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert" on public.reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "reviews_update" on public.reviews;
create policy "reviews_update" on public.reviews
  for update using (auth.uid() = user_id);

drop policy if exists "tickets_select" on public.tickets;
create policy "tickets_select" on public.tickets
  for select using (auth.uid() = user_id);

drop policy if exists "tickets_insert" on public.tickets;
create policy "tickets_insert" on public.tickets
  for insert with check (auth.uid() = user_id);

drop policy if exists "tickets_delete" on public.tickets;
create policy "tickets_delete" on public.tickets
  for delete using (auth.uid() = user_id);

drop policy if exists "parties_delete" on public.parties;
create policy "parties_delete" on public.parties
  for delete using (
    auth.uid() = user_id
    or auth.uid() = affiliate_id
  );

drop policy if exists "reviews_delete" on public.reviews;
create policy "reviews_delete" on public.reviews
  for delete using (auth.uid() = user_id);

drop policy if exists "going_select" on public.going;
create policy "going_select" on public.going
  for select using (auth.uid() = user_id);

drop policy if exists "going_insert" on public.going;
create policy "going_insert" on public.going
  for insert with check (auth.uid() = user_id);

drop policy if exists "going_delete" on public.going;
create policy "going_delete" on public.going
  for delete using (auth.uid() = user_id);

drop policy if exists "ticket_purchases_select" on public.ticket_purchases;
create policy "ticket_purchases_select" on public.ticket_purchases
  for select using (
    auth.uid() = host_id
    or auth.uid() = buyer_id
    or auth.uid() = affiliate_id
  );

drop policy if exists "ticket_purchases_insert" on public.ticket_purchases;
create policy "ticket_purchases_insert" on public.ticket_purchases
  for insert with check (auth.uid() = buyer_id);

-- Storage policies for the avatars bucket
-- (public read for everyone, writes only for the owner)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and owner = auth.uid());

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and owner = auth.uid());

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and owner = auth.uid());

grant select on storage.objects to anon;
grant all on storage.objects to authenticated;

-- ------------------------------------------------------------
-- Grants (anon can read the public scene, users can write their own)
-- ------------------------------------------------------------
grant select on table public.profiles, public.parties, public.reviews, public.tickets, public.going to anon;
grant all on table public.profiles, public.parties, public.reviews, public.tickets, public.going to authenticated;
grant select, insert on table public.ticket_purchases to authenticated;

-- ============================================================
-- Social layer — themes, follows, messenger, hype, streaks,
-- contact requests. Run this file (or this section) in the
-- Supabase SQL editor, then enable Realtime on the
-- "messages", "hypes" and "follows" tables if prompted.
-- ============================================================

-- Theme sync: the user's appearance choice (dark/light, preset,
-- accent, background) travels with their account.
alter table public.profiles add column if not exists theme text;

-- Follows (one row per follow edge)
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

-- Friend requests: the connection model. You can't send someone a hype
-- until they accept your request — one accepted row (either direction)
-- makes two people friends.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (sender_id, recipient_id)
);
create index if not exists friend_requests_inbox on public.friend_requests (recipient_id, created_at desc);

-- Messenger (direct messages between two users)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair on public.messages (sender_id, recipient_id, created_at);

-- Hype (short videos). recipient_id NULL = public post,
-- otherwise a private video sent to that user (feeds streaks).
create table if not exists public.hypes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete cascade,
  video_url text not null,
  caption text not null default '',
  views integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists hypes_feed on public.hypes (created_at desc);

-- Watch history: one row per (viewer, hype) so the feed can hide clips
-- you've already seen, and the profile's "Hyped" tab can list them.
create table if not exists public.hype_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  hype_id uuid not null references public.hypes (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, hype_id)
);
create index if not exists hype_views_user on public.hype_views (user_id, viewed_at desc);

-- Pre-existing databases already have a hypes table (the CREATE TABLE above
-- is skipped by `if not exists`), so add the views/hashtags columns here to
-- keep the bump RPC and feed ranking working on older projects.
alter table public.hypes add column if not exists views integer not null default 0;
alter table public.hypes add column if not exists hashtags text[] not null default '{}';

-- Views counter + watch history: bump atomically via RPC so rewatching a
-- clip (loops included) keeps counting up without read-modify-write
-- races, and records the viewer so the feed can hide what they've seen.
drop function if exists public.bump_hype_views(uuid); -- old 1-arg version, replaced below
drop function if exists public.bump_hype_views(uuid, uuid);
create or replace function public.bump_hype_views(p_hype_id uuid, p_viewer uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.hypes set views = views + 1 where id = p_hype_id;
  insert into public.hype_views (user_id, hype_id)
    select p_viewer, p_hype_id
    where p_viewer is not null
    on conflict (user_id, hype_id) do nothing;
$$;

grant execute on function public.bump_hype_views(uuid, uuid) to anon, authenticated;

-- Comments on a hype clip (public + private hypes can both be commented).
create table if not exists public.hype_comments (
  id uuid primary key default gen_random_uuid(),
  hype_id uuid not null references public.hypes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists hype_comments_hype on public.hype_comments (hype_id, created_at);
create index if not exists hype_comments_user on public.hype_comments (user_id);

-- Hype streaks between a pair of users (Snapchat-style flame)
create table if not exists public.hype_streaks (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  streak int not null default 1,
  last_date date not null default current_date,
  primary key (user_a, user_b)
);

-- Contact requests: guests reaching hosts who aren't on Festivity
-- yet ("Contact the host" / "Offer service")
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users (id) on delete set null,
  sender_name text,
  event_id text,
  event_name text,
  host_name text,
  kind text not null default 'contact',
  body text not null,
  created_at timestamptz not null default now()
);

-- Community blog posts (the merged News + Blog tab). Any signed-in
-- user can publish a scene report, guide or playlist entry.
create table if not exists public.posts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'Community',
  body text not null,
  author text,
  accent text,
  created_at timestamptz not null default now()
);
create index if not exists posts_feed on public.posts (created_at desc);

-- Public "hype" video storage bucket (public read, owner write)
insert into storage.buckets (id, name, public)
values ('hype', 'hype', true)
on conflict (id) do nothing;

drop policy if exists "hype_public_read" on storage.objects;
create policy "hype_public_read" on storage.objects
  for select using (bucket_id = 'hype');

drop policy if exists "hype_owner_write" on storage.objects;
create policy "hype_owner_write" on storage.objects
  for insert with check (bucket_id = 'hype' and owner = auth.uid());

drop policy if exists "hype_owner_update" on storage.objects;
create policy "hype_owner_update" on storage.objects
  for update using (bucket_id = 'hype' and owner = auth.uid());

drop policy if exists "hype_owner_delete" on storage.objects;
create policy "hype_owner_delete" on storage.objects
  for delete using (bucket_id = 'hype' and owner = auth.uid());

-- Public "groups" storage bucket for group cover photos
insert into storage.buckets (id, name, public)
values ('groups', 'groups', true)
on conflict (id) do nothing;

drop policy if exists "groups_public_read" on storage.objects;
create policy "groups_public_read" on storage.objects
  for select using (bucket_id = 'groups');

drop policy if exists "groups_owner_write" on storage.objects;
create policy "groups_owner_write" on storage.objects
  for insert with check (bucket_id = 'groups' and owner = auth.uid());

drop policy if exists "groups_owner_update" on storage.objects;
create policy "groups_owner_update" on storage.objects
  for update using (bucket_id = 'groups' and owner = auth.uid());

drop policy if exists "groups_owner_delete" on storage.objects;
create policy "groups_owner_delete" on storage.objects
  for delete using (bucket_id = 'groups' and owner = auth.uid());

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------
alter table public.follows enable row level security;
alter table public.friend_requests enable row level security;
alter table public.messages enable row level security;
alter table public.hypes enable row level security;
alter table public.hype_comments enable row level security;
alter table public.hype_views enable row level security;
alter table public.hype_streaks enable row level security;
alter table public.contact_requests enable row level security;

drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows
  for select using (true);

drop policy if exists "follows_insert" on public.follows;
create policy "follows_insert" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "follows_delete" on public.follows;
create policy "follows_delete" on public.follows
  for delete using (auth.uid() = follower_id);

drop policy if exists "friend_requests_select" on public.friend_requests;
create policy "friend_requests_select" on public.friend_requests
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "friend_requests_insert" on public.friend_requests;
create policy "friend_requests_insert" on public.friend_requests
  for insert with check (auth.uid() = sender_id and status = 'pending');

drop policy if exists "friend_requests_update" on public.friend_requests;
create policy "friend_requests_update" on public.friend_requests
  for update using (auth.uid() = recipient_id);

drop policy if exists "friend_requests_delete" on public.friend_requests;
create policy "friend_requests_delete" on public.friend_requests
  for delete using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (auth.uid() = sender_id);

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "hypes_select" on public.hypes;
create policy "hypes_select" on public.hypes
  for select using (recipient_id is null or auth.uid() = recipient_id or auth.uid() = user_id);

drop policy if exists "hypes_insert" on public.hypes;
create policy "hypes_insert" on public.hypes
  for insert with check (
    auth.uid() = user_id and (
      recipient_id is null
      -- A private hype can only go to someone who accepted your friend
      -- request (or whose request you accepted) — no cold-call clips.
      or exists (
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and (
            (fr.sender_id = auth.uid() and fr.recipient_id = recipient_id)
            or (fr.sender_id = recipient_id and fr.recipient_id = auth.uid())
          )
      )
    )
  );

drop policy if exists "hypes_delete" on public.hypes;
create policy "hypes_delete" on public.hypes
  for delete using (auth.uid() = user_id);

drop policy if exists "hype_comments_select" on public.hype_comments;
create policy "hype_comments_select" on public.hype_comments
  for select using (
    exists (
      select 1 from public.hypes h
      where h.id = hype_id
        and (h.recipient_id is null or auth.uid() = h.recipient_id or auth.uid() = h.user_id)
    )
  );

drop policy if exists "hype_comments_insert" on public.hype_comments;
create policy "hype_comments_insert" on public.hype_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "hype_comments_delete" on public.hype_comments;
create policy "hype_comments_delete" on public.hype_comments
  for delete using (auth.uid() = user_id);

drop policy if exists "hype_views_select" on public.hype_views;
create policy "hype_views_select" on public.hype_views
  for select using (auth.uid() = user_id);

drop policy if exists "hype_views_insert" on public.hype_views;
create policy "hype_views_insert" on public.hype_views
  for insert with check (auth.uid() = user_id);

-- Needed for the client's upsert (seen-marking on swipe) to update an
-- existing row instead of only ever inserting.
drop policy if exists "hype_views_update" on public.hype_views;
create policy "hype_views_update" on public.hype_views
  for update using (auth.uid() = user_id);

drop policy if exists "streaks_select" on public.hype_streaks;
create policy "streaks_select" on public.hype_streaks
  for select using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "streaks_insert" on public.hype_streaks;
create policy "streaks_insert" on public.hype_streaks
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "streaks_update" on public.hype_streaks;
create policy "streaks_update" on public.hype_streaks
  for update using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "contact_select" on public.contact_requests;
create policy "contact_select" on public.contact_requests
  for select using (auth.uid() = sender_id);

drop policy if exists "contact_insert" on public.contact_requests;
create policy "contact_insert" on public.contact_requests
  for insert with check (sender_id is null or auth.uid() = sender_id);

alter table public.posts enable row level security;

drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select using (true);

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_update" on public.posts;
create policy "posts_update" on public.posts
  for update using (auth.uid() = user_id);

drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete" on public.posts
  for delete using (auth.uid() = user_id);

grant select on table public.follows, public.messages, public.hypes, public.hype_streaks, public.contact_requests, public.posts to anon;
grant all on table public.follows, public.messages, public.hypes, public.hype_comments, public.hype_views, public.hype_streaks, public.contact_requests, public.posts, public.friend_requests to authenticated;

-- Global promo codes created from the Admin dashboard. One row per
-- code; buyers see them at checkout (discounts every ticket in an
-- order) once the creator publishes them here.
create table if not exists public.promo_codes (
  code text primary key,
  pct integer not null default 10 check (pct between 1 and 100),
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

drop policy if exists "promo_codes_select" on public.promo_codes;
create policy "promo_codes_select" on public.promo_codes
  for select using (true);

drop policy if exists "promo_codes_insert" on public.promo_codes;
create policy "promo_codes_insert" on public.promo_codes
  for insert with check (true);

drop policy if exists "promo_codes_delete" on public.promo_codes;
create policy "promo_codes_delete" on public.promo_codes
  for delete using (true);

grant select on table public.promo_codes to anon;
grant all on table public.promo_codes to authenticated;

-- ============================================================
-- FesGH — affiliate hosts, groups & communities, live streams
-- ============================================================

-- Videos go to the public Hype feed by default; users can turn this
-- off in their profile so clips stay private to their profile only.
alter table public.profiles add column if not exists hype_by_default boolean not null default true;

-- hypes.published: false = profile-only clip (never in the public feed).
alter table public.hypes add column if not exists published boolean not null default true;

-- Groups & communities (browse, join, post inside)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  cover text,
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_count int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists groups_feed on public.groups (created_at desc);
-- Group setting: videos posted in the group ALSO go to the public Hype
-- feed by default; the owner can switch this off in group settings.
alter table public.groups add column if not exists videos_to_hype boolean not null default true;

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists group_posts_feed on public.group_posts (group_id, created_at desc);
-- Group posts can carry a video: the clip is also a hype row (so it can
-- appear on the public feed per the group's videos_to_hype setting) and
-- the group post links back to it for in-chat playback.
alter table public.group_posts add column if not exists video_url text;
alter table public.group_posts add column if not exists hype_id uuid references public.hypes (id) on delete cascade;
alter table public.group_posts add column if not exists kind text not null default 'text';

-- Keep groups.member_count accurate whenever anyone joins or leaves.
create or replace function public.sync_group_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
  elsif (tg_op = 'DELETE') then
    update public.groups set member_count = greatest(1, member_count - 1) where id = old.group_id;
  end if;
  return null;
end;
$$;

drop trigger if exists group_members_count on public.group_members;
create trigger group_members_count
  after insert or delete on public.group_members
  for each row execute function public.sync_group_members();

-- Live streams: P2P WebRTC. Sessions are the catalog; live_signals
-- carry offer/answer/ICE between host and viewers via polling.
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Live',
  status text not null default 'live' check (status in ('live', 'ended')),
  viewers int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists live_sessions_live on public.live_sessions (status, started_at desc);

create table if not exists public.live_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  from_id uuid not null,
  to_id uuid not null,
  type text not null check (type in ('offer', 'answer', 'ice')),
  payload text not null,
  created_at timestamptz not null default now()
);
create index if not exists live_signals_to on public.live_signals (session_id, to_id, created_at);

-- Per-sale commission split: affiliate_share = 70% of the affiliate's
-- price margin (repost price − host's base price). The existing
-- commission column on both tables is the platform's 30% cut (30% of
-- the base + 30% of the margin = 30% of the sale price).
alter table public.tickets add column if not exists affiliate_share numeric not null default 0;
alter table public.tickets add column if not exists original_price numeric not null default 0;
alter table public.tickets add column if not exists payment_reference text;
alter table public.ticket_purchases add column if not exists affiliate_share numeric not null default 0;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.affiliates enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_signals enable row level security;

drop policy if exists "affiliates_select" on public.affiliates;
create policy "affiliates_select" on public.affiliates
  for select using (true);

-- Pay FIRST, then apply: an application can only be created with a
-- verified fee (fee_paid = true + its Paystack reference) and it always
-- lands as 'pending' — no one can insert themselves straight into
-- 'approved'. Approval only happens through the update path below
-- (Admin panel).
drop policy if exists "affiliates_insert" on public.affiliates;
create policy "affiliates_insert" on public.affiliates
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and fee_paid = true
    and fee_reference is not null
  );

-- The creator approves / rejects applications from the Admin panel
-- (client-gated like the rest of the admin tooling). A user may also
-- touch their OWN row while it's pending or rejected (fixing fee
-- details, re-applying) — but can never flip themselves to 'approved'.
drop policy if exists "affiliates_update" on public.affiliates;
create policy "affiliates_update" on public.affiliates
  for update using (
    auth.uid() <> user_id
    or status in ('pending', 'rejected')
  )
  with check (
    auth.uid() <> user_id
    or status = 'pending'
  );

drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups
  for select using (true);

drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups
  for insert with check (auth.uid() = owner_id);

drop policy if exists "groups_update" on public.groups;
create policy "groups_update" on public.groups
  for update using (auth.uid() = owner_id);

drop policy if exists "groups_delete" on public.groups;
create policy "groups_delete" on public.groups
  for delete using (auth.uid() = owner_id);

drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select" on public.group_members
  for select using (true);

drop policy if exists "group_members_insert" on public.group_members;
create policy "group_members_insert" on public.group_members
  for insert with check (
    auth.uid() = user_id
    -- Any member can invite others (inserting their membership row).
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_members_update" on public.group_members;
create policy "group_members_update" on public.group_members
  for update using (
    auth.uid() = user_id or
    auth.uid() = (select g.owner_id from public.groups g where g.id = group_id)
  );

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete using (
    auth.uid() = user_id or
    auth.uid() = (select g.owner_id from public.groups g where g.id = group_id)
  );

drop policy if exists "group_posts_select" on public.group_posts;
create policy "group_posts_select" on public.group_posts
  for select using (true);

drop policy if exists "group_posts_insert" on public.group_posts;
create policy "group_posts_insert" on public.group_posts
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_posts.group_id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_posts_delete" on public.group_posts;
create policy "group_posts_delete" on public.group_posts
  for delete using (auth.uid() = user_id);

drop policy if exists "live_sessions_select" on public.live_sessions;
create policy "live_sessions_select" on public.live_sessions
  for select using (true);

drop policy if exists "live_sessions_insert" on public.live_sessions;
create policy "live_sessions_insert" on public.live_sessions
  for insert with check (auth.uid() = host_id);

drop policy if exists "live_sessions_update" on public.live_sessions;
create policy "live_sessions_update" on public.live_sessions
  for update using (auth.uid() = host_id);

drop policy if exists "live_sessions_delete" on public.live_sessions;
create policy "live_sessions_delete" on public.live_sessions
  for delete using (auth.uid() = host_id);

drop policy if exists "live_signals_select" on public.live_signals;
create policy "live_signals_select" on public.live_signals
  for select using (true);

drop policy if exists "live_signals_insert" on public.live_signals;
create policy "live_signals_insert" on public.live_signals
  for insert with check (true);

drop policy if exists "live_signals_delete" on public.live_signals;
create policy "live_signals_delete" on public.live_signals
  for delete using (auth.uid() = from_id or auth.uid() = to_id);

grant select on table public.affiliates, public.groups, public.group_members, public.group_posts, public.live_sessions, public.live_signals to anon;
grant all on table public.affiliates, public.groups, public.group_members, public.group_posts, public.live_sessions, public.live_signals to authenticated;

-- Realtime: live messenger + hype + follow updates. Safe to re-run.
do $$
declare t text;
begin
  foreach t in array array['messages', 'hypes', 'hype_comments', 'hype_views', 'follows', 'friend_requests', 'parties', 'ticket_purchases', 'groups', 'group_members', 'group_posts', 'live_sessions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- ============================================================
-- FesGH — payout splits (host · admin · affiliate) + phone
-- numbers + blog moderation. Append this section to the end of
-- schema.sql and re-run the whole file, or run just this part.
-- ============================================================

-- Every user can give a phone number at signup (profiles.phone).
-- It's the fallback payout number; hosts/affiliates also set a
-- per-party payout number when they post.
alter table public.profiles add column if not exists phone text;

-- Where the money goes when a ticket sells:
--   · HOST party rows carry the host's payout phone (their 70% of
--     the base price).
--   · AFFILIATE repost rows carry the affiliate's payout phone
--     (their 70% of the margin).
-- The platform's 30% never needs a number — it stays in the
-- FesGH Paystack account automatically.
alter table public.parties add column if not exists payout_phone text;
alter table public.parties add column if not exists payout_network text;

-- Auto-payout state per sale (one row per ticket_purchases row):
--   pending  = charged but not paid out yet (queued / unconfigured)
--   paid     = host + affiliate shares transferred
--   failed   = a payout attempt errored — see the payouts ledger
alter table public.ticket_purchases add column if not exists payout_status text not null default 'pending';

-- Payout ledger — every transfer attempt, so the Admin panel can
-- audit who was paid what and retry anything that failed. Written
-- ONLY by the server (service role); the app just reads it.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.ticket_purchases (id) on delete cascade,
  party_id text,
  role text not null check (role in ('host', 'affiliate')),
  amount numeric not null default 0,
  phone text,
  network text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payment_reference text,
  recipient_code text,
  transfer_code text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payouts_purchase on public.payouts (purchase_id);
create index if not exists payouts_status on public.payouts (status, created_at desc);

-- One live payout row per (purchase, role) — a retry updates the
-- same row instead of piling up duplicates.
create unique index if not exists payouts_one_per_role
  on public.payouts (purchase_id, role);

alter table public.payouts enable row level security;

drop policy if exists "payouts_select" on public.payouts;
create policy "payouts_select" on public.payouts
  for select using (true);

grant select on table public.payouts to anon, authenticated;
-- The payout server (service role) writes the ledger and flips
-- ticket_purchases.payout_status. Explicit grants keep it working
-- even on projects where default privileges weren't configured.
grant all on table public.payouts to service_role;
grant all on table public.ticket_purchases to service_role;
grant all on table public.parties to service_role;
grant all on table public.profiles to service_role;

-- Signup now also records the phone number (from signup metadata)
-- so a new account's profile is ready immediately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url, phone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Blog moderation: the Admin panel removes community posts that
-- break the vibe. Security-definer so the dashboard can delete any
-- post regardless of owner (the Admin gate is client-side, like the
-- rest of the dashboard).
create or replace function public.admin_delete_post(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.posts where id = p_id;
end;
$$;

grant execute on function public.admin_delete_post(text) to authenticated;

-- Payout single-flight claims: the FIRST caller to claim a
-- (purchase, role) wins, so two concurrent payouts for the same
-- purchase can never both transfer money. The server's service role
-- claims a row, transfers, then records the outcome.
--   claim_payout  — first attempt: insert a pending row, only the
--                   inserter gets an id back.
--   retry_payout  — re-open a failed attempt (or one stuck pending
--                   for over 2 minutes — a crashed attempt), only
--                   the caller whose update matched gets an id back.
create or replace function public.claim_payout(p_purchase uuid, p_role text)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.payouts (purchase_id, role, status, updated_at)
  values (p_purchase, p_role, 'pending', now())
  on conflict (purchase_id, role) do nothing
  returning id;
$$;

create or replace function public.retry_payout(p_purchase uuid, p_role text)
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.payouts
  set status = 'pending', updated_at = now()
  where purchase_id = p_purchase and role = p_role
    and (
      status = 'failed'
      or (status = 'pending' and updated_at < now() - interval '2 minutes')
    )
  returning id;
$$;

revoke execute on function public.claim_payout(uuid, text) from public;
grant execute on function public.claim_payout(uuid, text) to service_role;
revoke execute on function public.retry_payout(uuid, text) from public;
grant execute on function public.retry_payout(uuid, text) to service_role;

-- Map-picked coordinates for a party's location (location picker).
-- Stays null when the location is typed manually.
alter table public.parties add column if not exists location_lat double precision;
alter table public.parties add column if not exists location_lng double precision;

-- ============================================================
-- Party cover images — the image a host/affiliate sets when
-- posting a party. The file lives in the public "party-covers"
-- storage bucket; its URL is stored on the party row (cover_url).
-- Null = fall back to the illustrated cover.
-- ============================================================
alter table public.parties add column if not exists cover_url text;

insert into storage.buckets (id, name, public)
values ('party-covers', 'party-covers', true)
on conflict (id) do nothing;

drop policy if exists "party_covers_public_read" on storage.objects;
create policy "party_covers_public_read" on storage.objects
  for select using (bucket_id = 'party-covers');

drop policy if exists "party_covers_owner_write" on storage.objects;
create policy "party_covers_owner_write" on storage.objects
  for insert with check (bucket_id = 'party-covers' and owner = auth.uid());

drop policy if exists "party_covers_owner_update" on storage.objects;
create policy "party_covers_owner_update" on storage.objects
  for update using (bucket_id = 'party-covers' and owner = auth.uid());

drop policy if exists "party_covers_owner_delete" on storage.objects;
create policy "party_covers_owner_delete" on storage.objects
  for delete using (bucket_id = 'party-covers' and owner = auth.uid());

-- ============================================================
-- One-time ticket scanning — a host's successful door check
-- marks the pass as used so the same hash can never be
-- rescanned or let in twice. verified_at lives on the host's
-- sales row (ticket_purchases) and is mirrored onto the
-- buyer's pass (tickets) so their wall can show "Used".
-- ============================================================
alter table public.ticket_purchases add column if not exists verified_at timestamptz;
alter table public.tickets add column if not exists verified_at timestamptz;

-- Atomically claim a scan: only the FIRST successful check of an unused
-- hash flips verified_at (a concurrent rescan serializes on the row lock
-- and its update matches 0 rows, losing the race). Ownership-checked —
-- the caller must be the party's ORIGINAL host or the reposting
-- affiliate, so nobody else can burn a ticket by knowing its hash.
create or replace function public.claim_ticket_scan(p_hash text)
returns table (claimed boolean, verified_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_hit timestamptz;
begin
  select id, verified_at into v_id, v_hit
    from public.ticket_purchases
   where upper(hash) = upper(p_hash)
     and (host_id = v_me or affiliate_id = v_me)
   limit 1;

  -- Not this account's sale (or doesn't exist) — claim=false, no time.
  if v_id is null then
    return query select false, null::timestamptz;
    return;
  end if;

  -- Already used — report the original scan time.
  if v_hit is not null then
    return query select false, v_hit;
    return;
  end if;

  -- First-come-wins: only one of two concurrent checks flips this.
  update public.ticket_purchases
     set verified_at = now()
   where id = v_id and verified_at is null;

  if found then
    -- Mirror onto the buyer's pass (same hash) so their wall shows Used.
    update public.tickets
       set verified_at = now()
     where hash is not null and upper(hash) = upper(p_hash)
       and verified_at is null;
    return query select true, now();
  end if;

  -- Lost the race — someone else scanned it first.
  select verified_at into v_hit from public.ticket_purchases where id = v_id;
  return query select false, v_hit;
end;
$$;

revoke execute on function public.claim_ticket_scan(text) from anon, public;
grant execute on function public.claim_ticket_scan(text) to authenticated;
