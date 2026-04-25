import { Pool, ResultSetHeader } from 'mysql2/promise';

export const normalizeDeleteIds = (ids: unknown, maxCount = 120) => {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean)
    .slice(0, maxCount);
};

export const deleteUserScopedRows = async (
  pool: Pool,
  tableName: string,
  userColumn: string,
  accountId: string,
  ids?: string[]
) => {
  if (ids) {
    const sanitizedIds = normalizeDeleteIds(ids);

    if (sanitizedIds.length === 0) {
      return 0;
    }

    const placeholders = sanitizedIds.map(() => '?').join(', ');
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM ${tableName} WHERE ${userColumn} = ? AND id IN (${placeholders})`,
      [accountId, ...sanitizedIds]
    );

    return result.affectedRows;
  }

  const [result] = await pool.execute<ResultSetHeader>(`DELETE FROM ${tableName} WHERE ${userColumn} = ?`, [accountId]);
  return result.affectedRows;
};
