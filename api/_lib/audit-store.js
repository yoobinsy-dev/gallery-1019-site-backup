const { query } = require('./db');

const AUDIT_TABLE_SQL = `
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
`;

const ALERT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_state_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

let initialized = false;

async function ensureAuditTables() {
  if (initialized) return;
  await query(AUDIT_TABLE_SQL);
  await query(ALERT_TABLE_SQL);
  initialized = true;
}

function normalizeIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function safeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

async function logStateWriteAttempt({
  requestId = null,
  stateKey,
  action,
  decision,
  reason = null,
  baseUpdatedAt = null,
  serverUpdatedAt = null,
  incomingCount = null,
  serverCount = null,
  mergedCount = null,
  clientId = null,
  details = null
}) {
  await ensureAuditTables();

  await query(
    `
      INSERT INTO app_state_write_audit (
        request_id,
        state_key,
        action,
        decision,
        reason,
        base_updated_at,
        server_updated_at,
        incoming_count,
        server_count,
        merged_count,
        client_id,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12::jsonb)
    `,
    [
      requestId,
      stateKey,
      action,
      decision,
      reason,
      normalizeIso(baseUpdatedAt),
      normalizeIso(serverUpdatedAt),
      safeInteger(incomingCount),
      safeInteger(serverCount),
      safeInteger(mergedCount),
      clientId,
      JSON.stringify(details || {})
    ]
  );
}

async function recordAlert({ alertType, severity = 'warning', message, details = null }) {
  await ensureAuditTables();

  const result = await query(
    `
      INSERT INTO app_state_alerts (alert_type, severity, message, details)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id, alert_type, severity, message, details, created_at
    `,
    [alertType, severity, message, JSON.stringify(details || {})]
  );

  return result.rows[0] || null;
}

async function getRecentDecisionCount(decisions, windowMinutes = 10) {
  await ensureAuditTables();

  const decisionList = Array.isArray(decisions) && decisions.length > 0
    ? decisions
    : ['conflict_rejected'];

  const result = await query(
    `
      SELECT COUNT(*)::int AS count
      FROM app_state_write_audit
      WHERE decision = ANY($1::text[])
        AND created_at >= NOW() - ($2::text || ' minutes')::interval
    `,
    [decisionList, String(Math.max(1, Number(windowMinutes) || 10))]
  );

  return result.rows[0]?.count || 0;
}

async function getLatestAlertByType(alertType) {
  await ensureAuditTables();

  const result = await query(
    `
      SELECT id, alert_type, severity, message, details, created_at
      FROM app_state_alerts
      WHERE alert_type = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [alertType]
  );

  return result.rows[0] || null;
}

async function maybeTriggerConflictSpikeAlert({ threshold = 5, windowMinutes = 10, cooldownMinutes = 30 } = {}) {
  const conflictCount = await getRecentDecisionCount(['conflict_rejected', 'stale_rejected'], windowMinutes);
  if (conflictCount < threshold) {
    return { triggered: false, conflictCount };
  }

  const latest = await getLatestAlertByType('conflict-spike');
  if (latest && latest.created_at) {
    const latestMs = new Date(latest.created_at).getTime();
    const nowMs = Date.now();
    const cooldownMs = Math.max(1, Number(cooldownMinutes) || 30) * 60 * 1000;
    if (Number.isFinite(latestMs) && nowMs - latestMs < cooldownMs) {
      return { triggered: false, conflictCount };
    }
  }

  const alert = await recordAlert({
    alertType: 'conflict-spike',
    severity: 'warning',
    message: `State conflicts spiked to ${conflictCount} in the last ${windowMinutes} minutes.`,
    details: {
      threshold,
      conflictCount,
      windowMinutes
    }
  });

  return { triggered: true, conflictCount, alert };
}

async function getRecentAuditEvents(limit = 50) {
  await ensureAuditTables();

  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 50));
  const result = await query(
    `
      SELECT id, request_id, state_key, action, decision, reason,
             base_updated_at, server_updated_at,
             incoming_count, server_count, merged_count,
             client_id, details, created_at
      FROM app_state_write_audit
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

async function getRecentAlerts(limit = 20) {
  await ensureAuditTables();

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await query(
    `
      SELECT id, alert_type, severity, message, details, created_at
      FROM app_state_alerts
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

module.exports = {
  ensureAuditTables,
  logStateWriteAttempt,
  recordAlert,
  maybeTriggerConflictSpikeAlert,
  getRecentDecisionCount,
  getRecentAuditEvents,
  getRecentAlerts
};
