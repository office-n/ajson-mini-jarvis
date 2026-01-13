-- Ledger schema (v1)
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT,
  created_at TEXT
);
