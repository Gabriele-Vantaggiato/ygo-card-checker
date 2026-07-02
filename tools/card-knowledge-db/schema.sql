-- Card knowledge DB for AI-related card suggestions.
-- Populated from YGOProDeck API; tags via rules now, LLM/embeddings later.

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
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL CHECK (source IN ('rule', 'llm', 'manual')),
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

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_archetype ON cards(archetype);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag);
CREATE INDEX IF NOT EXISTS idx_card_relations_source ON card_relations(source_id, score DESC);
