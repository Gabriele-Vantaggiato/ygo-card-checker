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
  synced_at TEXT NOT NULL,
  setcode_json TEXT,
  babel_category INTEGER,
  babel_strings_json TEXT
);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL CHECK (source IN ('rule', 'llm', 'manual', 'format', 'category')),
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

-- Real tournament-decklist co-occurrence (scraped from ygoprodeck.com/deck/* pages).
-- card_a < card_id always, so each unordered pair is stored once.
CREATE TABLE IF NOT EXISTS deck_cooccurrence (
  card_a INTEGER NOT NULL,
  card_b INTEGER NOT NULL,
  deck_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_a, card_b)
);
CREATE INDEX IF NOT EXISTS idx_deck_cooccurrence_a ON deck_cooccurrence(card_a);
CREATE INDEX IF NOT EXISTS idx_deck_cooccurrence_b ON deck_cooccurrence(card_b);

CREATE TABLE IF NOT EXISTS scraped_decks (
  slug TEXT PRIMARY KEY,
  scraped_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag);
CREATE INDEX IF NOT EXISTS idx_card_relations_source ON card_relations(source_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_card_effects_kind ON card_effects(effect_kind);
CREATE INDEX IF NOT EXISTS idx_card_mentions_mention ON card_mentions(mention);

CREATE TABLE IF NOT EXISTS card_scripts (
  card_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  interrupts_json TEXT NOT NULL,
  timings_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  lua_source TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto', 'hat')),
  confidence REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

-- Pillar 1: semantic enrichment (roles/triggers/outcomes/cost flags/restrictions).
-- One row per card, flat JSON columns — same pattern as formats_json/setcode_json above.
CREATE TABLE IF NOT EXISTS card_semantic_profile (
  card_id INTEGER PRIMARY KEY,
  roles_json TEXT NOT NULL DEFAULT '[]',
  triggers_json TEXT NOT NULL DEFAULT '[]',
  outcomes_json TEXT NOT NULL DEFAULT '[]',
  cost_flags_json TEXT NOT NULL DEFAULT '{"discardsForCost":false,"tributesForCost":false,"banishesForCost":false}',
  restrictions_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('rule', 'llm', 'manual')) DEFAULT 'rule',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

-- Pillar 3: modular engine detection. "combo_" prefix avoids colliding with the
-- existing frontend AssistanceEngine / 'engine' relation-kind naming.
CREATE TABLE IF NOT EXISTS combo_engines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  min_cards_threshold INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS combo_engine_cards (
  engine_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('core', 'support')) DEFAULT 'core',
  min_copies INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (engine_id, card_id),
  FOREIGN KEY (engine_id) REFERENCES combo_engines(id),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
CREATE INDEX IF NOT EXISTS idx_combo_engine_cards_card ON combo_engine_cards(card_id);

-- Pillar 4: combo flows, gated by an Engine or an explicit set of key cards.
CREATE TABLE IF NOT EXISTS combo_flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  engine_id INTEGER,
  steps_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (engine_id) REFERENCES combo_engines(id)
);

CREATE TABLE IF NOT EXISTS combo_flow_key_cards (
  flow_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  PRIMARY KEY (flow_id, card_id),
  FOREIGN KEY (flow_id) REFERENCES combo_flows(id),
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
