import { Pool } from 'mysql2/promise';
import { MonitorEventRow, MonitorSessionRow } from '../mysql';
import { formatMonitorEvent, formatMonitorSession } from '../formatters';
import { normalizeSqlLimit } from '../utils';
import { deleteUserScopedRows } from './deleteHelpers';

export const getMonitorSessionById = async (pool: Pool, sessionId: string) => {
  const [rows] = await pool.query<MonitorSessionRow[]>(
    `SELECT
      id,
      user_account_id,
      device_name,
      camera_label,
      status,
      capture_interval_seconds,
      baseline_score,
      latest_score,
      average_score,
      event_count,
      alert_count,
      latest_event,
      latest_action,
      latest_snapshot,
      started_at,
      ended_at
    FROM monitor_sessions
    WHERE id = ?
    LIMIT 1`,
    [sessionId]
  );

  return rows[0] || null;
};

export const getLatestMonitorSessionByUser = async (pool: Pool, accountId: string) => {
  const [rows] = await pool.query<MonitorSessionRow[]>(
    `SELECT
      id,
      user_account_id,
      device_name,
      camera_label,
      status,
      capture_interval_seconds,
      baseline_score,
      latest_score,
      average_score,
      event_count,
      alert_count,
      latest_event,
      latest_action,
      latest_snapshot,
      started_at,
      ended_at
    FROM monitor_sessions
    WHERE user_account_id = ?
    ORDER BY started_at DESC
    LIMIT 1`,
    [accountId]
  );

  return rows[0] || null;
};

export const getMonitorSessionsByUser = async (pool: Pool, accountId: string, limit = 20) => {
  const normalizedLimit = normalizeSqlLimit(limit, 20, 50);

  const [rows] = await pool.query<MonitorSessionRow[]>(
    `SELECT
      id,
      user_account_id,
      device_name,
      camera_label,
      status,
      capture_interval_seconds,
      baseline_score,
      latest_score,
      average_score,
      event_count,
      alert_count,
      latest_event,
      latest_action,
      latest_snapshot,
      started_at,
      ended_at
    FROM monitor_sessions
    WHERE user_account_id = ?
    ORDER BY started_at DESC
    LIMIT ${normalizedLimit}`,
    [accountId]
  );

  return rows.map(formatMonitorSession);
};

export const getRecentMonitorEvents = async (pool: Pool, sessionId: string, limit = 20) => {
  const normalizedLimit = normalizeSqlLimit(limit, 20, 100);

  const [rows] = await pool.query<MonitorEventRow[]>(
    `SELECT
      id,
      session_id,
      score,
      event_type,
      risk_level,
      change_label,
      event,
      action,
      suggestions,
      snapshot,
      created_at
    FROM monitor_events
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ${normalizedLimit}`,
    [sessionId]
  );

  return rows.map(formatMonitorEvent);
};

export const deleteMonitorSessionsByUser = (pool: Pool, accountId: string, ids?: string[]) =>
  deleteUserScopedRows(pool, 'monitor_sessions', 'user_account_id', accountId, ids);
