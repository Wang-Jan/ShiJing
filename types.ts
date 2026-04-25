export enum DeviceStatus {
  ONLINE = '在线',
  OFFLINE = '离线',
  WORKING = '工作中',
  IDLE = '待命',
}

export interface AuthUser {
  accountId: string;
  nickname: string;
  avatar?: string | null;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface UserPreferences {
  themePreference: ThemePreference;
  defaultMonitorIntervalSeconds: number;
  autoCreateTaskEnabled: boolean;
  notificationEnabled: boolean;
  highRiskAlertEnabled: boolean;
}

export interface Suggestion {
  label: string;
  desc: string;
  impact: string;
}

export interface Insight {
  id: string;
  time: string;
  type: 'pickup' | 'place' | 'warn' | 'info' | 'success';
  event: string;
  action: string;
  score?: number;
  imageUrl?: string;
  suggestions?: Suggestion[];
}

export type ActivityLogLevel = 'info' | 'success' | 'warn';

export type ActivityLogKind = 'analysis' | 'task' | 'verification' | 'monitor' | 'account';

export interface ActivityLog {
  id: string;
  kind: ActivityLogKind;
  level: ActivityLogLevel;
  title: string;
  description: string;
  score?: number | null;
  relatedType?: string | null;
  relatedId?: string | null;
  createdAt: string;
}

export type AppNotificationKind = ActivityLogKind | 'system';

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  level: ActivityLogLevel;
  title: string;
  description: string;
  relatedType?: string | null;
  relatedId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface RobotTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed';
  timestamp: string;
}

export type CleaningTaskStatus = 'pending' | 'running' | 'completed' | 'ignored';

export type CleaningTaskPriority = 'low' | 'medium' | 'high';

export type CleaningTaskSourceType = 'manual' | 'analysis' | 'monitor';

export interface CleaningTaskVerification {
  id: string;
  taskId: string;
  beforeScore?: number | null;
  afterScore: number;
  scoreDelta?: number | null;
  beforeImageUrl?: string | null;
  afterImageUrl: string;
  beforeSummary?: string | null;
  afterSummary: string;
  afterAction: string;
  afterSuggestions: Suggestion[];
  createdAt: string;
}

export interface CleaningTask {
  id: string;
  title: string;
  description: string;
  priority: CleaningTaskPriority;
  status: CleaningTaskStatus;
  sourceType: CleaningTaskSourceType;
  sourceId?: string | null;
  score?: number | null;
  imageUrl?: string | null;
  suggestions: Suggestion[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  latestVerification?: CleaningTaskVerification | null;
  verificationCount?: number;
}

export interface AnalysisRecord {
  id: string;
  score: number;
  event: string;
  action: string;
  suggestions: Suggestion[];
  imageUrl?: string | null;
  taskId?: string | null;
  createdAt: string;
}

export interface AnalysisRecordStats {
  totalCount: number;
  averageScore: number | null;
  bestScore: number | null;
  needsAttentionCount: number;
  taskLinkedCount: number;
}

export interface DashboardTrendPoint {
  date: string;
  averageScore: number | null;
  analysisCount: number;
  verificationCount: number;
  averageDelta: number | null;
}

export interface DashboardStats {
  latestDeskScore: number | null;
  todayAnalysisCount: number;
  todayTaskCreatedCount: number;
  weeklyAverageScore: number | null;
  pendingTaskCount: number;
  runningTaskCount: number;
  completedTaskCount: number;
  weeklyCompletedTaskCount: number;
  taskCompletionRate: number;
  verifiedTaskCount: number;
  averageImprovement: number | null;
  highRiskEventCount: number;
  monitorSessionCount: number;
  unreadNotificationCount: number;
  latestUnreadNotification?: AppNotification | null;
  scoreTrend: DashboardTrendPoint[];
}

export type MonitoringStatus = 'idle' | 'starting' | 'monitoring' | 'paused' | 'stopped' | 'error';

export type MonitorRiskLevel = 'low' | 'medium' | 'high';

export type MonitorEventType =
  | 'baseline'
  | 'stable'
  | 'improved'
  | 'declined'
  | 'alert'
  | 'manual_snapshot';

export interface MonitorEvent {
  id: string;
  sessionId: string;
  score: number;
  event: string;
  action: string;
  suggestions: Suggestion[];
  riskLevel: MonitorRiskLevel;
  eventType: MonitorEventType;
  changeLabel: string;
  snapshot?: string | null;
  createdAt: string;
}

export interface MonitorSessionSummary {
  sessionId: string;
  status: MonitoringStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  deviceName: string;
  cameraLabel?: string | null;
  captureIntervalSeconds: number;
  baselineScore?: number | null;
  latestScore?: number | null;
  averageScore?: number | null;
  eventCount: number;
  alertCount: number;
  latestEvent?: string | null;
  latestAction?: string | null;
  latestSnapshot?: string | null;
}

export interface MonitorFrameAnalysis {
  session: MonitorSessionSummary;
  event: MonitorEvent;
  result: {
    score: number;
    event: string;
    action: string;
    suggestions: Suggestion[];
  };
}
