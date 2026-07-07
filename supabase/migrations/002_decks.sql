-- MVP-1: per-user deck storage (sync with local deck id).

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text not null,
  name text not null,
  cards jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists decks_user_id_idx on public.decks (user_id);
create index if not exists decks_public_idx on public.decks (is_public) where is_public = true;

alter table public.decks enable row level security;

create policy "decks_select_own"
  on public.decks for select
  using (auth.uid() = user_id);

create policy "decks_select_public"
  on public.decks for select
  using (is_public = true);

create policy "decks_insert_own"
  on public.decks for insert
  with check (auth.uid() = user_id);

create policy "decks_update_own"
  on public.decks for update
  using (auth.uid() = user_id);

create policy "decks_delete_own"
  on public.decks for delete
  using (auth.uid() = user_id);
