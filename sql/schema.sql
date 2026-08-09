CREATE TABLE IF NOT EXISTS app_state (
  state_key TEXT PRIMARY KEY,
  state_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_state_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date_kst DATE NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'daily-19-kst',
  state_payload JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ,
  restored_by TEXT,
  UNIQUE (snapshot_date_kst, snapshot_type)
);

CREATE TABLE IF NOT EXISTS app_state_write_audit (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  state_key TEXT NOT NULL,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  base_updated_at TIMESTAMPTZ,
  server_updated_at TIMESTAMPTZ,
  incoming_count INTEGER,
  server_count INTEGER,
  merged_count INTEGER,
  client_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_state_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exhibition_state_snapshots (
  id BIGSERIAL PRIMARY KEY,
  exhibition_id BIGINT NOT NULL,
  snapshot_date_kst DATE NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'daily-19-kst',
  snapshot_payload JSONB NOT NULL,
  works_goods_count INTEGER NOT NULL DEFAULT 0,
  sold_items_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  archive_url TEXT,
  archive_path TEXT,
  archive_stored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMPTZ,
  restored_by TEXT,
  undo_consumed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS exhibition_state_snapshots_auto_slot_unique_idx
  ON exhibition_state_snapshots (exhibition_id, snapshot_date_kst, snapshot_type)
  WHERE snapshot_type IN ('auto-07-kst', 'auto-19-kst', 'daily-19-kst');
