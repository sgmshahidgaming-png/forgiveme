-- ═══════════════════════════════════════════════════════════════════
-- Forgivemе — Complete Supabase SQL Setup
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ─── ENABLE EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── PROFILES TABLE ─────────────────────────────────────────────────
create table if not exists profiles (
  id                    uuid references auth.users on delete cascade primary key,
  email                 text,
  is_premium            boolean         default false,
  free_uses_count       integer         default 0,
 razorpay_order_id     text,
razorpay_payment_id   text,
  premium_expires_at    timestamptz,
  created_at            timestamptz     default now()
);

-- Auto-create profile on new user signup (including anonymous)
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── STORIES TABLE ──────────────────────────────────────────────────
create table if not exists stories (
  id                  uuid            default gen_random_uuid() primary key,
  slug                text            unique not null,
  user_id             uuid            references profiles(id) on delete set null,
  recipient_user_id   uuid            references profiles(id),
  recipient_name      text,
  sender_name         text,
  message             text,
  tone                text,
  media_urls          jsonb           default '[]',
  view_count          integer         default 0,
  is_active           boolean         default true,
  created_at          timestamptz     default now()
);

create index if not exists idx_stories_slug    on stories(slug);
create index if not exists idx_stories_user_id on stories(user_id);

-- ─── DEVICE TOKENS TABLE ────────────────────────────────────────────
create table if not exists device_tokens (
  id          uuid    default gen_random_uuid() primary key,
  user_id     uuid    references profiles(id) on delete cascade not null,
  token       text    not null,
  platform    text    not null check (platform in ('ios', 'android', 'web')),
  updated_at  timestamptz default now(),
  unique (user_id, platform)
);

create index if not exists idx_device_tokens_user_id on device_tokens(user_id);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────
alter table profiles     enable row level security;
alter table stories      enable row level security;
alter table device_tokens enable row level security;

-- Profiles: users manage their own
drop policy if exists "Own profile only" on profiles;
create policy "Own profile only"
  on profiles for all
  using (auth.uid() = id);

-- Stories: owners manage; anyone can read active stories (for shared links)
drop policy if exists "Owner manages story" on stories;
create policy "Owner manages story"
  on stories for all
  using (auth.uid() = user_id);

drop policy if exists "Public can view active stories" on stories;
create policy "Public can view active stories"
  on stories for select
  using (is_active = true);

-- Device tokens: users manage their own
drop policy if exists "Own tokens only" on device_tokens;
create policy "Own tokens only"
  on device_tokens for all
  using (auth.uid() = user_id);

-- ─── ATOMIC FREE USE INCREMENT ──────────────────────────────────────
-- Prevents race conditions when multiple tabs/devices create simultaneously
create or replace function increment_free_uses()
returns void language sql as $$
  update profiles
  set free_uses_count = free_uses_count + 1
  where id = auth.uid();
$$;

-- ─── STORAGE BUCKETS ────────────────────────────────────────────────
-- Run these separately if buckets don't exist yet:
-- Supabase Dashboard → Storage → New bucket

-- insert into storage.buckets (id, name, public) values ('story-photos', 'story-photos', true);
-- insert into storage.buckets (id, name, public) values ('story-audio',  'story-audio',  true);

-- Storage RLS: authenticated users upload to their own subfolder; public reads
drop policy if exists "User uploads to own folder" on storage.objects;
create policy "User uploads to own folder"
  on storage.objects for insert
  with check (
    auth.uid()::text = (storage.foldername(name))[1]
    and bucket_id in ('story-photos', 'story-audio')
  );

drop policy if exists "Public read storage" on storage.objects;
create policy "Public read storage"
  on storage.objects for select
  using (bucket_id in ('story-photos', 'story-audio'));

-- ─── DONE ────────────────────────────────────────────────────────────
-- After running this SQL:
-- 1. Go to Authentication → Providers → enable Anonymous sign-in
-- 2. Go to Storage → create 'story-photos' and 'story-audio' buckets (public)
-- 3. Set up Database Webhooks for push notifications (see README.md)
