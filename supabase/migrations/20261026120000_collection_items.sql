-- Physical card collection per user. Row Level Security: owner only.
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  passcode bigint not null,
  card_name text not null,
  set_code text not null,
  rarity text not null,
  language text not null default 'EN',
  condition text not null default 'NM' check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  first_edition boolean not null default false,
  quantity integer not null check (quantity >= 1),
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, set_code, rarity, language, condition, first_edition)
);

create index collection_items_user_passcode_idx on public.collection_items (user_id, passcode);

alter table public.collection_items enable row level security;

create policy "collection_items_select_own" on public.collection_items
  for select using (auth.uid() = user_id);
create policy "collection_items_insert_own" on public.collection_items
  for insert with check (auth.uid() = user_id);
create policy "collection_items_update_own" on public.collection_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collection_items_delete_own" on public.collection_items
  for delete using (auth.uid() = user_id);
