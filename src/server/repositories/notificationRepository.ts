import { Pool } from 'mysql2/promise';
import { ActivityLogLevel, AppNotificationKind } from '../../../types';
import { NotificationRow, NotificationSummaryRow } from '../mysql';
import { formatNotification } from '../formatters';
import { createEntityId, normalizeSqlLimit } from '../utils';
import { deleteUserScopedRows } from './deleteHelpers';

export const createNotification = async (
  pool: Pool,
  input: {
    accountId: string;
    kind: AppNotificationKind;
    level: ActivityLogLevel;
    title: string;
    description: string;
    relatedType?: string | null;
    relatedId?: string | null;
  }
) => {
  const notificationId = createEntityId('notice');

  await pool.execute(
    `INSERT INTO notifications (
      id,
      user_account_id,
      kind,
      level,
      title,
      description,
      related_type,
      related_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      notificationId,
      input.accountId,
      input.kind,
      input.level,
      input.title,
      input.description,
      input.relatedType ?? null,
      input.relatedId ?? null,
    ]
  );
};

export const getNotificationsByUser = async (
  pool: Pool,
  accountId: string,
  options: {
    limit?: number;
    unreadOnly?: boolean;
  } = {}
) => {
  const limit = normalizeSqlLimit(options.limit, 30, 80);
  const unreadFilter = options.unreadOnly ? 'AND read_at IS NULL' : '';

  const [rows] = await pool.query<NotificationRow[]>(
    `SELECT
      id,
      user_account_id,
      kind,
      level,
      title,
      description,
      related_type,
      related_id,
      read_at,
      created_at
    FROM notifications
    WHERE user_account_id = ? ${unreadFilter}
    ORDER BY created_at DESC
    LIMIT ${limit}`,
    [accountId]
  );

  return rows.map(formatNotification);
};

export const getNotificationSummaryByUser = async (pool: Pool, accountId: string) => {
  const [[summaryRows], notifications] = await Promise.all([
    pool.query<NotificationSummaryRow[]>(
      `SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_account_id = ? AND read_at IS NULL`,
      [accountId]
    ),
    getNotificationsByUser(pool, accountId, { limit: 1, unreadOnly: true }),
  ]);

  return {
    unreadCount: Number(summaryRows[0]?.unread_count ?? 0),
    latestUnreadNotification: notifications[0] ?? null,
  };
};

export const markNotificationsAsRead = async (pool: Pool, accountId: string, ids?: string[]) => {
  if (ids) {
    const sanitizedIds = ids.map((id) => id.trim()).filter(Boolean).slice(0, 80);

    if (sanitizedIds.length === 0) {
      return;
    }

    const placeholders = sanitizedIds.map(() => '?').join(', ');
    await pool.execute(
      `UPDATE notifications
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE user_account_id = ? AND id IN (${placeholders})`,
      [accountId, ...sanitizedIds]
    );
    return;
  }

  await pool.execute(
    `UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_account_id = ? AND read_at IS NULL`,
    [accountId]
  );
};

export const deleteNotificationsByUser = (pool: Pool, accountId: string, ids?: string[]) =>
  deleteUserScopedRows(pool, 'notifications', 'user_account_id', accountId, ids);
