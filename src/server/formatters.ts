import {
  ActivityLog,
  ActivityLogKind,
  ActivityLogLevel,
  AnalysisRecord,
  AnalysisRecordStats,
  AppNotification,
  AppNotificationKind,
  CleaningTask,
  CleaningTaskPriority,
  CleaningTaskSourceType,
  CleaningTaskStatus,
  CleaningTaskVerification,
  DashboardTrendPoint,
  MonitorEvent,
  MonitorEventType,
  MonitorRiskLevel,
  MonitorSessionSummary,
  MonitoringStatus,
  ThemePreference,
  UserPreferences,
} from '../../types';
import {
  ActivityLogRow,
  AnalysisRecordRow,
  AnalysisRecordStatsRow,
  CleaningTaskRow,
  DashboardTrendRow,
  MonitorEventRow,
  MonitorSessionRow,
  NotificationRow,
  TaskVerificationRow,
  UserPreferencesRow,
} from './mysql';
import { DEFAULT_USER_PREFERENCES } from './constants';
import { normalizeCaptureInterval, parseNumericValue, parseSuggestionsJson, toISOString } from './utils';

const toMonitoringStatus = (status: string): MonitoringStatus => {
  switch (status) {
    case 'starting':
    case 'monitoring':
    case 'paused':
    case 'stopped':
    case 'error':
      return status;
    default:
      return 'idle';
  }
};

export const formatMonitorSession = (row: MonitorSessionRow): MonitorSessionSummary => ({
  sessionId: row.id,
  status: toMonitoringStatus(row.status),
  startedAt: toISOString(row.started_at),
  endedAt: toISOString(row.ended_at),
  deviceName: row.device_name,
  cameraLabel: row.camera_label,
  captureIntervalSeconds: row.capture_interval_seconds,
  baselineScore: parseNumericValue(row.baseline_score),
  latestScore: parseNumericValue(row.latest_score),
  averageScore: parseNumericValue(row.average_score),
  eventCount: row.event_count,
  alertCount: row.alert_count,
  latestEvent: row.latest_event,
  latestAction: row.latest_action,
  latestSnapshot: row.latest_snapshot,
});

export const formatMonitorEvent = (row: MonitorEventRow): MonitorEvent => ({
  id: row.id,
  sessionId: row.session_id,
  score: row.score,
  event: row.event,
  action: row.action,
  suggestions: parseSuggestionsJson(row.suggestions),
  riskLevel: row.risk_level as MonitorRiskLevel,
  eventType: row.event_type as MonitorEventType,
  changeLabel: row.change_label,
  snapshot: row.snapshot,
  createdAt: toISOString(row.created_at) || new Date().toISOString(),
});

const toCleaningTaskStatus = (status: string): CleaningTaskStatus => {
  switch (status) {
    case 'pending':
    case 'running':
    case 'completed':
    case 'ignored':
      return status;
    default:
      return 'pending';
  }
};

const toCleaningTaskPriority = (priority: string): CleaningTaskPriority => {
  switch (priority) {
    case 'high':
    case 'low':
      return priority;
    default:
      return 'medium';
  }
};

const toCleaningTaskSourceType = (sourceType: string): CleaningTaskSourceType => {
  switch (sourceType) {
    case 'analysis':
    case 'monitor':
      return sourceType;
    default:
      return 'manual';
  }
};

export const formatCleaningTask = (row: CleaningTaskRow): CleaningTask => ({
  id: row.id,
  title: row.title,
  description: row.description,
  priority: toCleaningTaskPriority(row.priority),
  status: toCleaningTaskStatus(row.status),
  sourceType: toCleaningTaskSourceType(row.source_type),
  sourceId: row.source_id,
  score: parseNumericValue(row.score),
  imageUrl: row.image,
  suggestions: parseSuggestionsJson(row.suggestions),
  createdAt: toISOString(row.created_at) || new Date().toISOString(),
  updatedAt: toISOString(row.updated_at) || new Date().toISOString(),
  completedAt: toISOString(row.completed_at),
});

export const formatTaskVerification = (row: TaskVerificationRow): CleaningTaskVerification => ({
  id: row.id,
  taskId: row.task_id,
  beforeScore: parseNumericValue(row.before_score),
  afterScore: row.after_score,
  scoreDelta: parseNumericValue(row.score_delta),
  beforeImageUrl: row.before_image,
  afterImageUrl: row.after_image,
  beforeSummary: row.before_summary,
  afterSummary: row.after_summary,
  afterAction: row.after_action,
  afterSuggestions: parseSuggestionsJson(row.after_suggestions),
  createdAt: toISOString(row.created_at) || new Date().toISOString(),
});

export const formatAnalysisRecord = (row: AnalysisRecordRow): AnalysisRecord => ({
  id: row.id,
  score: row.score,
  event: row.event,
  action: row.action,
  suggestions: parseSuggestionsJson(row.suggestions),
  imageUrl: row.image,
  taskId: row.task_id,
  createdAt: toISOString(row.created_at) || new Date().toISOString(),
});

export const formatAnalysisStats = (row: AnalysisRecordStatsRow | undefined): AnalysisRecordStats => ({
  totalCount: Number(row?.total_count ?? 0),
  averageScore: parseNumericValue(row?.average_score),
  bestScore: parseNumericValue(row?.best_score),
  needsAttentionCount: Number(row?.needs_attention_count ?? 0),
  taskLinkedCount: Number(row?.task_linked_count ?? 0),
});

export const toActivityLogLevel = (value: string): ActivityLogLevel => {
  switch (value) {
    case 'success':
    case 'warn':
      return value;
    default:
      return 'info';
  }
};

export const toActivityLogKind = (value: string): ActivityLogKind => {
  switch (value) {
    case 'analysis':
    case 'task':
    case 'verification':
    case 'monitor':
    case 'account':
      return value;
    default:
      return 'analysis';
  }
};

const toAppNotificationKind = (value: string): AppNotificationKind => {
  if (value === 'system') {
    return value;
  }

  return toActivityLogKind(value);
};

export const formatActivityLog = (row: ActivityLogRow): ActivityLog => ({
  id: row.id,
  kind: toActivityLogKind(row.kind),
  level: toActivityLogLevel(row.level),
  title: row.title,
  description: row.description,
  score: parseNumericValue(row.score),
  relatedType: row.related_type,
  relatedId: row.related_id,
  createdAt: toISOString(row.created_at) || new Date().toISOString(),
});

export const formatNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  kind: toAppNotificationKind(row.kind),
  level: toActivityLogLevel(row.level),
  title: row.title,
  description: row.description,
  relatedType: row.related_type,
  relatedId: row.related_id,
  readAt: toISOString(row.read_at),
  createdAt: toISOString(row.created_at) || new Date().toISOString(),
});

export const normalizeThemePreference = (value: unknown): ThemePreference => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return DEFAULT_USER_PREFERENCES.themePreference;
};

export const normalizeAutoCreateTaskEnabled = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }

  return DEFAULT_USER_PREFERENCES.autoCreateTaskEnabled;
};

export const normalizeBooleanPreference = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return fallback;
};

export const formatUserPreferences = (row?: UserPreferencesRow | null): UserPreferences => ({
  themePreference: normalizeThemePreference(row?.theme_preference),
  defaultMonitorIntervalSeconds: normalizeCaptureInterval(row?.default_monitor_interval_seconds),
  autoCreateTaskEnabled:
    typeof row?.auto_create_task_enabled === 'number'
      ? row.auto_create_task_enabled === 1
      : DEFAULT_USER_PREFERENCES.autoCreateTaskEnabled,
  notificationEnabled: normalizeBooleanPreference(
    row?.notification_enabled,
    DEFAULT_USER_PREFERENCES.notificationEnabled
  ),
  highRiskAlertEnabled: normalizeBooleanPreference(
    row?.high_risk_alert_enabled,
    DEFAULT_USER_PREFERENCES.highRiskAlertEnabled
  ),
});

export const normalizeTaskPriority = (priority: unknown): CleaningTaskPriority => {
  if (priority === 'high' || priority === 'medium' || priority === 'low') {
    return priority;
  }

  return 'medium';
};

export const normalizeTaskStatus = (status: unknown): CleaningTaskStatus | null => {
  if (status === 'pending' || status === 'running' || status === 'completed' || status === 'ignored') {
    return status;
  }

  return null;
};

export const formatDashboardTrendPoint = (row: DashboardTrendRow): DashboardTrendPoint => ({
  date: row.stat_date,
  averageScore: parseNumericValue(row.average_score),
  analysisCount: Number(row.analysis_count ?? 0),
  verificationCount: Number(row.verification_count ?? 0),
  averageDelta: parseNumericValue(row.average_delta),
});
