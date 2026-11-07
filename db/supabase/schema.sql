-- Djuu family data on Supabase (Postgres, EU region Frankfurt). Run once in the SQL editor of the new project.
-- Sign-in by e-mail link (no passwords). Every row belongs to a family; row level security lets only its members see it.
-- Kids are members without an account (user_id null). Places and offers stay public files (data/*.json), only references are stored here.

create extension if not exists pgcrypto;

create table families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Familie',
  state_code  text default 'DE-HH',                 -- school holidays
  created_at  timestamptz not null default now()
);

create table members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families on delete cascade,
  user_id     uuid references auth.users on delete set null,  -- null for children
  name        text not null,
  kind        text not null check (kind in ('adult', 'kid')),
  color       text,
  birth_ym    text,                                -- 'YYYY-MM', kids only
  birth_day   smallint,                            -- optional
  school      text, size text, shoe text,          -- optional, kids
  work_hours  text,                                -- optional, adults
  created_at  timestamptz not null default now(),
  unique (family_id, user_id)
);

-- invite by link: the token is shown once as a link, only its hash is stored
create table invites (
  token_hash  text primary key,
  family_id   uuid not null references families on delete cascade,
  created_by  uuid not null references members on delete cascade,
  expires_at  timestamptz not null default now() + interval '7 days',
  used_at     timestamptz
);

create table shop_items (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families on delete cascade,
  name        text not null,
  qty         text,
  cat         text not null default 'sonst',
  added_by    uuid references members on delete set null,
  added_at    timestamptz not null default now(),
  done_by     uuid references members on delete set null,
  done_at     timestamptz,
  later       boolean not null default false
);

-- per family: what was bought how often, the learned aisle of an item and the learned order of the aisles
create table shop_memory (
  family_id   uuid primary key references families on delete cascade,
  history     jsonb not null default '{}',
  learned     jsonb not null default '{}',
  rank        jsonb not null default '{}',
  trips       int not null default 0
);

create table errands (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families on delete cascade,
  title       text not null,
  link        text check (link is null or link ~ '^https?://'),
  for_member  uuid references members on delete set null,
  price       text, note text,
  state       text not null default 'idee' check (state in ('idee', 'ja', 'gekauft')),
  added_by    uuid references members on delete set null,
  added_at    timestamptz not null default now()
);

create table saved_offers (
  family_id   uuid not null references families on delete cascade,
  offer_id    text not null,
  snapshot    jsonb not null,                      -- title, url, venue, date: readable after the offer is gone
  saved_by    uuid references members on delete set null,
  saved_at    timestamptz not null default now(),
  primary key (family_id, offer_id)
);

create table saved_places (
  family_id   uuid not null references families on delete cascade,
  place_id    text not null,
  saved_by    uuid references members on delete set null,
  saved_at    timestamptz not null default now(),
  primary key (family_id, place_id)
);

create table visits (
  family_id   uuid not null references families on delete cascade,
  offer_id    text not null,
  day         date not null,
  added_by    uuid references members on delete set null,
  primary key (family_id, offer_id, day)
);

-- "Wo seid ihr?": a request, and at most one answer with a position; deleted after 24 hours (see cleanup below)
create table pings (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families on delete cascade,
  from_member uuid not null references members on delete cascade,
  to_member   uuid not null references members on delete cascade,
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  lat         double precision,
  lon         double precision,
  accuracy_m  int
);

create table push_subscriptions (
  member_id   uuid not null references members on delete cascade,
  endpoint    text primary key,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- secret, per family: the address of the family calendar feed (webcal), can be renewed
create table calendar_feeds (
  family_id   uuid primary key references families on delete cascade,
  token_hash  text not null,
  created_at  timestamptz not null default now()
);

-- ---------- Row level security ----------
create or replace function is_member(f uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from members where family_id = f and user_id = auth.uid()) $$;

alter table families enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table shop_items enable row level security;
alter table shop_memory enable row level security;
alter table errands enable row level security;
alter table saved_offers enable row level security;
alter table saved_places enable row level security;
alter table visits enable row level security;
alter table pings enable row level security;
alter table push_subscriptions enable row level security;
alter table calendar_feeds enable row level security;

create policy fam_read on families for select using (is_member(id));
create policy fam_update on families for update using (is_member(id));
create policy mem_all on members for all using (is_member(family_id)) with check (is_member(family_id));
create policy shop_all on shop_items for all using (is_member(family_id)) with check (is_member(family_id));
create policy shopmem_all on shop_memory for all using (is_member(family_id)) with check (is_member(family_id));
create policy err_all on errands for all using (is_member(family_id)) with check (is_member(family_id));
create policy so_all on saved_offers for all using (is_member(family_id)) with check (is_member(family_id));
create policy sp_all on saved_places for all using (is_member(family_id)) with check (is_member(family_id));
create policy vis_all on visits for all using (is_member(family_id)) with check (is_member(family_id));
-- a position is only visible to the two people of a ping
create policy ping_read on pings for select using (
  exists (select 1 from members m where m.user_id = auth.uid() and m.id in (from_member, to_member)));
create policy ping_ask on pings for insert with check (
  is_member(family_id) and exists (select 1 from members m where m.id = from_member and m.user_id = auth.uid()));
create policy ping_answer on pings for update using (
  exists (select 1 from members m where m.id = to_member and m.user_id = auth.uid()));
create policy push_own on push_subscriptions for all using (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()));
-- invites and calendar feeds are only touched by server functions (service role), never by the app directly

-- creating a family and joining by invite run as functions, so nobody can add themselves to a foreign family
create or replace function create_family(fname text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  insert into families (name) values (coalesce(nullif(fname, ''), 'Familie')) returning id into f;
  insert into members (family_id, user_id, name, kind) values (f, auth.uid(), my_name, 'adult');
  insert into shop_memory (family_id) values (f);
  return f;
end $$;

create or replace function join_family(token text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where token_hash = encode(digest(token, 'sha256'), 'hex') and used_at is null and expires_at > now();
  if not found then raise exception 'invite invalid or expired'; end if;
  insert into members (family_id, user_id, name, kind) values (inv.family_id, auth.uid(), my_name, 'adult') on conflict (family_id, user_id) do nothing;
  update invites set used_at = now() where token_hash = inv.token_hash;
  return inv.family_id;
end $$;

-- live updates for the shared lists
alter publication supabase_realtime add table shop_items, errands, saved_offers, pings;

-- positions are not kept: run daily (Supabase cron) -> delete from pings where created_at < now() - interval '24 hours';

-- a member creates an invite link; the plain token only ever exists in that link
create or replace function create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare me members; tok text := encode(gen_random_bytes(18), 'hex');
begin
  select * into me from members where user_id = auth.uid() limit 1;
  if not found then raise exception 'not in a family'; end if;
  insert into invites (token_hash, family_id, created_by) values (encode(digest(tok, 'sha256'), 'hex'), me.family_id, me.id);
  return tok;
end $$;
