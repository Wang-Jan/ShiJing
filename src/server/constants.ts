import { UserPreferences } from '../../types';

export const PORT = 3000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HEALTH_CHECK_SAMPLE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pQn2wAAAABJRU5ErkJggg==';

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  themePreference: 'system',
  defaultMonitorIntervalSeconds: 8,
  autoCreateTaskEnabled: true,
  notificationEnabled: true,
  highRiskAlertEnabled: true,
};
