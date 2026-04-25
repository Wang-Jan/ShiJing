import { Pool } from 'mysql2/promise';
import {
  CleaningTask,
  CleaningTaskPriority,
  CleaningTaskSourceType,
  CleaningTaskStatus,
  CleaningTaskVerification,
  Suggestion,
} from '../../../types';
import { CleaningTaskRow, TaskVerificationRow } from '../mysql';
import { formatCleaningTask, formatTaskVerification } from '../formatters';
import { createEntityId, normalizeSqlLimit, parseNumericValue } from '../utils';
import { AnalysisResultLike } from '../domain';
import { deleteUserScopedRows } from './deleteHelpers';

const getTaskPriorityFromScore = (score: number): CleaningTaskPriority => {
  if (score < 55) {
    return 'high';
  }

  if (score < 78) {
    return 'medium';
  }

  return 'low';
};

const getTaskVerificationRowsByTaskIds = async (pool: Pool, taskIds: string[]) => {
  if (taskIds.length === 0) {
    return [];
  }

  const placeholders = taskIds.map(() => '?').join(', ');
  const [rows] = await pool.query<TaskVerificationRow[]>(
    `SELECT
      id,
      task_id,
      user_account_id,
      before_score,
      after_score,
      score_delta,
      before_image,
      after_image,
      before_summary,
      after_summary,
      after_action,
      after_suggestions,
      created_at
    FROM task_verifications
    WHERE task_id IN (${placeholders})
    ORDER BY created_at DESC`,
    taskIds
  );

  return rows;
};

const attachTaskVerificationMeta = async (pool: Pool, tasks: CleaningTask[]) => {
  if (tasks.length === 0) {
    return tasks;
  }

  const verificationRows = await getTaskVerificationRowsByTaskIds(
    pool,
    tasks.map((task) => task.id)
  );
  const latestVerificationByTaskId = new Map<string, CleaningTaskVerification>();
  const verificationCountByTaskId = new Map<string, number>();

  verificationRows.forEach((row) => {
    verificationCountByTaskId.set(row.task_id, (verificationCountByTaskId.get(row.task_id) ?? 0) + 1);

    if (!latestVerificationByTaskId.has(row.task_id)) {
      latestVerificationByTaskId.set(row.task_id, formatTaskVerification(row));
    }
  });

  return tasks.map((task) => ({
    ...task,
    latestVerification: latestVerificationByTaskId.get(task.id) ?? null,
    verificationCount: verificationCountByTaskId.get(task.id) ?? 0,
  }));
};

const getTaskVerificationById = async (pool: Pool, verificationId: string) => {
  const [rows] = await pool.query<TaskVerificationRow[]>(
    `SELECT
      id,
      task_id,
      user_account_id,
      before_score,
      after_score,
      score_delta,
      before_image,
      after_image,
      before_summary,
      after_summary,
      after_action,
      after_suggestions,
      created_at
    FROM task_verifications
    WHERE id = ?
    LIMIT 1`,
    [verificationId]
  );

  return rows[0] || null;
};

export const getCleaningTaskById = async (pool: Pool, taskId: string) => {
  const [rows] = await pool.query<CleaningTaskRow[]>(
    `SELECT
      id,
      user_account_id,
      source_type,
      source_id,
      title,
      description,
      priority,
      status,
      score,
      image,
      suggestions,
      created_at,
      updated_at,
      completed_at
    FROM cleaning_tasks
    WHERE id = ?
    LIMIT 1`,
    [taskId]
  );

  return rows[0] || null;
};

export const getCleaningTasksByUser = async (
  pool: Pool,
  accountId: string,
  status: CleaningTaskStatus | null,
  limit = 80
) => {
  const params: Array<string | number> = [accountId];
  const normalizedLimit = normalizeSqlLimit(limit, 80, 120);
  let statusClause = '';

  if (status) {
    statusClause = 'AND status = ?';
    params.push(status);
  }

  const [rows] = await pool.query<CleaningTaskRow[]>(
    `SELECT
      id,
      user_account_id,
      source_type,
      source_id,
      title,
      description,
      priority,
      status,
      score,
      image,
      suggestions,
      created_at,
      updated_at,
      completed_at
    FROM cleaning_tasks
    WHERE user_account_id = ?
    ${statusClause}
    ORDER BY
      FIELD(status, 'running', 'pending', 'completed', 'ignored'),
      FIELD(priority, 'high', 'medium', 'low'),
      created_at DESC
    LIMIT ${normalizedLimit}`,
    params
  );

  return attachTaskVerificationMeta(pool, rows.map(formatCleaningTask));
};

export const getCleaningTaskWithVerificationById = async (pool: Pool, taskId: string) => {
  const row = await getCleaningTaskById(pool, taskId);

  if (!row) {
    return null;
  }

  const [task] = await attachTaskVerificationMeta(pool, [formatCleaningTask(row)]);
  return task ?? null;
};

export const createCleaningTask = async (
  pool: Pool,
  input: {
    accountId: string;
    title: string;
    description: string;
    priority: CleaningTaskPriority;
    sourceType: CleaningTaskSourceType;
    sourceId?: string | null;
    score?: number | null;
    imageUrl?: string | null;
    suggestions?: Suggestion[];
  }
) => {
  const taskId = createEntityId('task');

  await pool.execute(
    `INSERT INTO cleaning_tasks (
      id,
      user_account_id,
      source_type,
      source_id,
      title,
      description,
      priority,
      status,
      score,
      image,
      suggestions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      taskId,
      input.accountId,
      input.sourceType,
      input.sourceId ?? null,
      input.title,
      input.description,
      input.priority,
      input.score ?? null,
      input.imageUrl ?? null,
      JSON.stringify(input.suggestions ?? []),
    ]
  );

  const task = await getCleaningTaskWithVerificationById(pool, taskId);

  if (!task) {
    throw new Error('清洁任务已创建，但无法重新读取任务信息');
  }

  return task;
};

export const createCleaningTaskFromAnalysis = async (
  pool: Pool,
  input: {
    accountId: string;
    sourceType: CleaningTaskSourceType;
    sourceId?: string | null;
    result: AnalysisResultLike;
    imageUrl?: string | null;
  }
) => {
  const title = input.result.score < 55 ? '立即清理高风险桌面杂物' : '整理桌面可见杂物';

  return createCleaningTask(pool, {
    accountId: input.accountId,
    title,
    description: input.result.action || input.result.event,
    priority: getTaskPriorityFromScore(input.result.score),
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    score: input.result.score,
    imageUrl: input.imageUrl ?? null,
    suggestions: input.result.suggestions,
  });
};

export const createTaskVerification = async (
  pool: Pool,
  input: {
    task: CleaningTaskRow;
    accountId: string;
    afterImageUrl: string;
    result: AnalysisResultLike;
  }
) => {
  const verificationId = createEntityId('verify');
  const beforeScore = parseNumericValue(input.task.score);
  const scoreDelta = beforeScore === null ? null : input.result.score - beforeScore;

  await pool.execute(
    `INSERT INTO task_verifications (
      id,
      task_id,
      user_account_id,
      before_score,
      after_score,
      score_delta,
      before_image,
      after_image,
      before_summary,
      after_summary,
      after_action,
      after_suggestions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      verificationId,
      input.task.id,
      input.accountId,
      beforeScore,
      input.result.score,
      scoreDelta,
      input.task.image ?? null,
      input.afterImageUrl,
      input.task.description || null,
      input.result.event,
      input.result.action,
      JSON.stringify(input.result.suggestions),
    ]
  );

  await pool.execute(
    `UPDATE cleaning_tasks
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [input.task.id]
  );

  const verification = await getTaskVerificationById(pool, verificationId);

  if (!verification) {
    throw new Error('任务验证已保存，但无法重新读取验证结果');
  }

  return formatTaskVerification(verification);
};

export const deleteCleaningTasksByUser = (pool: Pool, accountId: string, ids?: string[]) =>
  deleteUserScopedRows(pool, 'cleaning_tasks', 'user_account_id', accountId, ids);
