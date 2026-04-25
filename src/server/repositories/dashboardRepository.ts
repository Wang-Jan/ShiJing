import { Pool } from 'mysql2/promise';
import { DashboardStats } from '../../../types';
import {
  ActivityLogRow,
  AnalysisRecordRow,
  DashboardTrendRow,
  MonitorSessionRow,
  TaskStatusStatsRow,
  VerificationStatsRow,
} from '../mysql';
import { formatDashboardTrendPoint } from '../formatters';
import { parseNumericValue } from '../utils';
import { getNotificationSummaryByUser } from './notificationRepository';

export const getDashboardStatsByUser = async (pool: Pool, accountId: string): Promise<DashboardStats> => {
  const [
    latestSessionRows,
    latestAnalysisRows,
    todayAnalysisRows,
    weeklyAverageRows,
    taskStatusRows,
    todayTaskRows,
    weeklyCompletedTaskRows,
    verificationRows,
    highRiskRows,
    monitorSessionRows,
    notificationSummary,
    trendRows,
  ] = await Promise.all([
    pool.query<MonitorSessionRow[]>(
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
    ),
    pool.query<AnalysisRecordRow[]>(
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
      LIMIT 1`,
      [accountId]
    ),
    pool.query<Array<{ total_count: number | string | null } & ActivityLogRow>>(
      `SELECT COUNT(*) AS total_count
      FROM analysis_records
      WHERE user_account_id = ? AND DATE(created_at) = CURDATE()`,
      [accountId]
    ),
    pool.query<Array<{ average_score: number | string | null } & ActivityLogRow>>(
      `SELECT AVG(score) AS average_score
      FROM analysis_records
      WHERE user_account_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [accountId]
    ),
    pool.query<TaskStatusStatsRow[]>(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        COUNT(*) AS total_count
      FROM cleaning_tasks
      WHERE user_account_id = ?`,
      [accountId]
    ),
    pool.query<Array<{ total_count: number | string | null } & ActivityLogRow>>(
      `SELECT COUNT(*) AS total_count
      FROM cleaning_tasks
      WHERE user_account_id = ? AND DATE(created_at) = CURDATE()`,
      [accountId]
    ),
    pool.query<Array<{ total_count: number | string | null } & ActivityLogRow>>(
      `SELECT COUNT(*) AS total_count
      FROM cleaning_tasks
      WHERE user_account_id = ?
        AND status = 'completed'
        AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [accountId]
    ),
    pool.query<VerificationStatsRow[]>(
      `SELECT
        COUNT(*) AS verified_count,
        AVG(score_delta) AS average_delta
      FROM task_verifications
      WHERE user_account_id = ?`,
      [accountId]
    ),
    pool.query<Array<{ high_risk_count: number | string | null } & ActivityLogRow>>(
      `SELECT COUNT(*) AS high_risk_count
      FROM monitor_events me
      INNER JOIN monitor_sessions ms ON ms.id = me.session_id
      WHERE ms.user_account_id = ? AND me.risk_level = 'high' AND me.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [accountId]
    ),
    pool.query<Array<{ total_count: number | string | null } & ActivityLogRow>>(
      `SELECT COUNT(*) AS total_count
      FROM monitor_sessions
      WHERE user_account_id = ? AND started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [accountId]
    ),
    getNotificationSummaryByUser(pool, accountId),
    pool.query<DashboardTrendRow[]>(
      `SELECT
        day_source.stat_date,
        AVG(day_source.score_value) AS average_score,
        SUM(day_source.analysis_count) AS analysis_count,
        SUM(day_source.verification_count) AS verification_count,
        AVG(day_source.delta_value) AS average_delta
      FROM (
        SELECT
          DATE(created_at) AS stat_date,
          score AS score_value,
          1 AS analysis_count,
          0 AS verification_count,
          NULL AS delta_value
        FROM analysis_records
        WHERE user_account_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        UNION ALL
        SELECT
          DATE(created_at) AS stat_date,
          after_score AS score_value,
          0 AS analysis_count,
          1 AS verification_count,
          score_delta AS delta_value
        FROM task_verifications
        WHERE user_account_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      ) AS day_source
      GROUP BY day_source.stat_date
      ORDER BY day_source.stat_date ASC`,
      [accountId, accountId]
    ),
  ]);

  const latestSession = latestSessionRows[0][0] ?? null;
  const latestAnalysis = latestAnalysisRows[0][0] ?? null;
  const taskStatus = taskStatusRows[0][0];
  const verificationStats = verificationRows[0][0];
  const todayAnalysisCount = Number(todayAnalysisRows[0][0]?.total_count ?? 0);
  const weeklyAverageScore = parseNumericValue(weeklyAverageRows[0][0]?.average_score);
  const pendingTaskCount = Number(taskStatus?.pending_count ?? 0);
  const runningTaskCount = Number(taskStatus?.running_count ?? 0);
  const completedTaskCount = Number(taskStatus?.completed_count ?? 0);
  const todayTaskCreatedCount = Number(todayTaskRows[0][0]?.total_count ?? 0);
  const weeklyCompletedTaskCount = Number(weeklyCompletedTaskRows[0][0]?.total_count ?? 0);
  const totalTaskCount = Number(taskStatus?.total_count ?? 0);
  const taskCompletionRate = totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : 0;
  const verifiedTaskCount = Number(verificationStats?.verified_count ?? 0);
  const averageImprovement = parseNumericValue(verificationStats?.average_delta);
  const highRiskEventCount = Number(highRiskRows[0][0]?.high_risk_count ?? 0);
  const monitorSessionCount = Number(monitorSessionRows[0][0]?.total_count ?? 0);
  const latestDeskScore = parseNumericValue(latestSession?.latest_score) ?? parseNumericValue(latestAnalysis?.score);

  return {
    latestDeskScore,
    todayAnalysisCount,
    todayTaskCreatedCount,
    weeklyAverageScore,
    pendingTaskCount,
    runningTaskCount,
    completedTaskCount,
    weeklyCompletedTaskCount,
    taskCompletionRate,
    verifiedTaskCount,
    averageImprovement,
    highRiskEventCount,
    monitorSessionCount,
    unreadNotificationCount: notificationSummary.unreadCount,
    latestUnreadNotification: notificationSummary.latestUnreadNotification,
    scoreTrend: trendRows[0].map(formatDashboardTrendPoint),
  };
};
