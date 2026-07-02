-- Card knowledge DB for rule-based card suggestions.
-- Populated from YGOProDeck API.

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  race TEXT,
  attribute TEXT,
  level INTEGER,
  archetype TEXT,
  desc_en TEXT NOT NULL,
  desc_it TEXT,
  atk INTEGER,
  def INTEGER,
  tcg_date TEXT,
  ban_tcg TEXT,
  ban_goat TEXT,
  formats_json TEXT,
  frame_type TEXT,
  link_val INTEGER,
  pendulum_scale INTEGER,
  is_extra_deck INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL CHECK (source IN ('rule', 'llm', 'manual', 'format')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, tag, source),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS card_relations (
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  score REAL NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('rule', 'llm', 'embedding')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, relation, method),
  FOREIGN KEY (source_id) REFERENCES cards(id),
  FOREIGN KEY (target_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS card_effects (
  card_id INTEGER NOT NULL,
  effect_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'rule',
  created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, effect_kind, source),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS card_mentions (
  card_id INTEGER NOT NULL,
  mention TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'rule',
  created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, mention, source),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS card_format_legality (
  card_id INTEGER NOT NULL,
  format_id TEXT NOT NULL,
  in_pool INTEGER NOT NULL,
  ban_status TEXT NOT NULL,
  max_copies INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (card_id, format_id),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE INDEX IF NOT EXISTS idx_cfl_format_verdict ON card_format_legality(format_id, verdict);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag);
CREATE INDEX IF NOT EXISTS idx_card_relations_source ON card_relations(source_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_card_effects_kind ON card_effects(effect_kind);
CREATE INDEX IF NOT EXISTS idx_card_mentions_mention ON card_mentions(mention);
