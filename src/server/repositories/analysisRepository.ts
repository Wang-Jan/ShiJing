import { Pool } from 'mysql2/promise';
import { AnalysisRecordRow, AnalysisRecordStatsRow } from '../mysql';
import { formatAnalysisRecord, formatAnalysisStats } from '../formatters';
import { createEntityId, normalizeSqlLimit } from '../utils';
import { AnalysisResultLike } from '../domain';
import { deleteUserScopedRows } from './deleteHelpers';

export const getAnalysisRecordById = async (pool: Pool, recordId: string) => {
  const [rows] = await pool.query<AnalysisRecordRow[]>(
    `SELECT
      id,
      user_account_id,
      score,
      event,
      action,
      suggestions,
      image,
      task_id,
      created_at
    FROM analysis_records
    WHERE id = ?
    LIMIT 1`,
    [recordId]
  );

  return rows[0] || null;
};

export const getAnalysisRecordsByUser = async (pool: Pool, accountId: string, limit = 30) => {
  const normalizedLimit = normalizeSqlLimit(limit, 30, 80);

  const [rows] = await pool.query<AnalysisRecordRow[]>(
    `SELECT
      id,
      user_account_id,
      score,
      event,
      action,
      suggestions,
      image,
      task_id,
      created_at
    FROM analysis_records
    WHERE user_account_id = ?
    ORDER BY created_at DESC
    LIMIT ${normalizedLimit}`,
    [accountId]
  );

  return rows.map(formatAnalysisRecord);
};

export const getAnalysisStatsByUser = async (pool: Pool, accountId: string) => {
  const [rows] = await pool.query<AnalysisRecordStatsRow[]>(
    `SELECT
      COUNT(*) AS total_count,
      AVG(score) AS average_score,
      MAX(score) AS best_score,
      SUM(CASE WHEN score < 78 THEN 1 ELSE 0 END) AS needs_attention_count,
      SUM(CASE WHEN task_id IS NOT NULL THEN 1 ELSE 0 END) AS task_linked_count
    FROM analysis_records
    WHERE user_account_id = ?`,
    [accountId]
  );

  return formatAnalysisStats(rows[0]);
};

export const createAnalysisRecord = async (
  pool: Pool,
  input: {
    accountId: string;
    result: AnalysisResultLike;
    imageUrl?: string | null;
  }
) => {
  const recordId = createEntityId('analysis');

  await pool.execute(
    `INSERT INTO analysis_records (
      id,
      user_account_id,
      score,
      event,
      action,
      suggestions,
      image
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      recordId,
      input.accountId,
      input.result.score,
      input.result.event,
      input.result.action,
      JSON.stringify(input.result.suggestions),
      input.imageUrl ?? null,
    ]
  );

  const record = await getAnalysisRecordById(pool, recordId);

  if (!record) {
    throw new Error('分析记录已创建，但无法重新读取记录信息');
  }

  return formatAnalysisRecord(record);
};

export const attachTaskToAnalysisRecord = async (pool: Pool, recordId: string, taskId: string) => {
  await pool.execute('UPDATE analysis_records SET task_id = ? WHERE id = ?', [taskId, recordId]);
  const record = await getAnalysisRecordById(pool, recordId);
  return record ? formatAnalysisRecord(record) : null;
};

export const deleteAnalysisRecordsByUser = (pool: Pool, accountId: string, ids?: string[]) =>
  deleteUserScopedRows(pool, 'analysis_records', 'user_account_id', accountId, ids);
