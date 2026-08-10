-- ============================================================
-- Festivity GH — Supabase schema
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
  for select using (true);

drop policy if exists "parties_insert" on public.parties;
create policy "parties_insert" on public.parties
  for insert with check (auth.uid() = user_id);

drop policy if exists "parties_update" on public.parties;
create policy "parties_update" on public.parties
  for update using (auth.uid() = user_id);

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
  for delete using (auth.uid() = user_id);

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
  for select using (auth.uid() = host_id or auth.uid() = buyer_id);

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

-- Views counter: bump atomically via RPC so rewatching a clip (loops
-- included) keeps counting up without read-modify-write races.
create or replace function public.bump_hype_views(p_hype_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.hypes set views = views + 1 where id = p_hype_id;
$$;

grant execute on function public.bump_hype_views(uuid) to anon, authenticated;

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

-- Hashtags are stored as a text array parsed from the caption at post
-- time, so the feed can rank / filter by them without re-parsing.
alter table public.hypes add column if not exists hashtags text[] not null default '{}';

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

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------
alter table public.follows enable row level security;
alter table public.messages enable row level security;
alter table public.hypes enable row level security;
alter table public.hype_comments enable row level security;
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
  for insert with check (auth.uid() = user_id);

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
grant all on table public.follows, public.messages, public.hypes, public.hype_streaks, public.contact_requests, public.posts to authenticated;

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

-- Realtime: live messenger + hype + follow updates. Safe to re-run.
do $$
declare t text;
begin
  foreach t in array array['messages', 'hypes', 'hype_comments', 'follows', 'parties', 'ticket_purchases'] loop
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
