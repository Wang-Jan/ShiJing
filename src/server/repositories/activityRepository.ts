import { Pool } from 'mysql2/promise';
import { ActivityLogKind, ActivityLogLevel } from '../../../types';
import { ActivityLogRow } from '../mysql';
import { formatActivityLog } from '../formatters';
import { createEntityId, normalizeSqlLimit } from '../utils';
import { getUserPreferencesByAccountId } from './preferencesRepository';
import { createNotification } from './notificationRepository';
import { deleteUserScopedRows } from './deleteHelpers';

const shouldCreateNotificationForActivity = (
  preferences: Awaited<ReturnType<typeof getUserPreferencesByAccountId>>,
  input: {
    kind: ActivityLogKind;
    level: ActivityLogLevel;
  }
) => {
  if (!preferences.notificationEnabled) {
    return false;
  }

  if (input.kind === 'monitor' && input.level === 'warn' && !preferences.highRiskAlertEnabled) {
    return false;
  }

  return input.level !== 'info' || input.kind === 'verification' || input.kind === 'account';
};

export const createActivityLog = async (
  pool: Pool,
  input: {
    accountId: string;
    kind: ActivityLogKind;
    level: ActivityLogLevel;
    title: string;
    description: string;
    score?: number | null;
    relatedType?: string | null;
    relatedId?: string | null;
  }
) => {
  const activityId = createEntityId('activity');

  await pool.execute(
    `INSERT INTO activity_logs (
      id,
      user_account_id,
      kind,
      level,
      title,
      description,
      score,
      related_type,
      related_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      input.accountId,
      input.kind,
      input.level,
      input.title,
      input.description,
      input.score ?? null,
      input.relatedType ?? null,
      input.relatedId ?? null,
    ]
  );

  const preferences = await getUserPreferencesByAccountId(pool, input.accountId);

  if (!shouldCreateNotificationForActivity(preferences, input)) {
    return;
  }

  await createNotification(pool, {
    accountId: input.accountId,
    kind: input.kind,
    level: input.level,
    title: input.title,
    description: input.description,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
  });
};

export const getActivityLogsByUser = async (pool: Pool, accountId: string, limit = 20) => {
  const normalizedLimit = normalizeSqlLimit(limit, 20, 120);

  const [rows] = await pool.query<ActivityLogRow[]>(
    `SELECT
      id,
      user_account_id,
      kind,
      level,
      title,
      description,
      score,
      related_type,
      related_id,
      created_at
    FROM activity_logs
    WHERE user_account_id = ?
    ORDER BY created_at DESC
    LIMIT ${normalizedLimit}`,
    [accountId]
  );

  return rows.map(formatActivityLog);
};

export const deleteActivityLogsByUser = (pool: Pool, accountId: string, ids?: string[]) =>
  deleteUserScopedRows(pool, 'activity_logs', 'user_account_id', accountId, ids);
