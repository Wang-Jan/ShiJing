import { Pool } from 'mysql2/promise';
import { UserPreferences } from '../../../types';
import { UserPreferencesRow } from '../mysql';
import { formatUserPreferences } from '../formatters';
import { normalizeCaptureInterval } from '../utils';

export const getUserPreferencesByAccountId = async (pool: Pool, accountId: string): Promise<UserPreferences> => {
  const [rows] = await pool.query<UserPreferencesRow[]>(
    `SELECT
      user_account_id,
      theme_preference,
      default_monitor_interval_seconds,
      auto_create_task_enabled,
      notification_enabled,
      high_risk_alert_enabled,
      updated_at
    FROM user_preferences
    WHERE user_account_id = ?
    LIMIT 1`,
    [accountId]
  );

  return formatUserPreferences(rows[0]);
};

export const upsertUserPreferences = async (
  pool: Pool,
  accountId: string,
  input: UserPreferences
): Promise<UserPreferences> => {
  await pool.execute(
    `INSERT INTO user_preferences (
      user_account_id,
      theme_preference,
      default_monitor_interval_seconds,
      auto_create_task_enabled,
      notification_enabled,
      high_risk_alert_enabled
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      theme_preference = VALUES(theme_preference),
      default_monitor_interval_seconds = VALUES(default_monitor_interval_seconds),
      auto_create_task_enabled = VALUES(auto_create_task_enabled),
      notification_enabled = VALUES(notification_enabled),
      high_risk_alert_enabled = VALUES(high_risk_alert_enabled)`,
    [
      accountId,
      input.themePreference,
      normalizeCaptureInterval(input.defaultMonitorIntervalSeconds),
      input.autoCreateTaskEnabled ? 1 : 0,
      input.notificationEnabled ? 1 : 0,
      input.highRiskAlertEnabled ? 1 : 0,
    ]
  );

  return getUserPreferencesByAccountId(pool, accountId);
};
