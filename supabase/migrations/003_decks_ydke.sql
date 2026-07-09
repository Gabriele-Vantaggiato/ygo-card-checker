-- Store YDKE URL for published decks (browse/import without full card resolution).

alter table public.decks
  add column if not exists ydke text;

create index if not exists decks_public_ydke_idx
  on public.decks (is_public)
  where is_public = true and ydke is not null;
