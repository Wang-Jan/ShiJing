import { MonitorEventType, MonitorRiskLevel } from '../../types';

export const shouldCreateCleaningTask = (score: number, eventType?: MonitorEventType) =>
  score < 78 || eventType === 'alert' || eventType === 'declined';

export const getRiskLevel = (score: number): MonitorRiskLevel => {
  if (score < 55) {
    return 'high';
  }

  if (score < 78) {
    return 'medium';
  }

  return 'low';
};

export const buildMonitorEventMeta = (
  currentScore: number,
  previousScore: number | null,
  isFirstFrame: boolean
) => {
  if (isFirstFrame || previousScore === null) {
    return {
      eventType: 'baseline' as MonitorEventType,
      changeLabel: '已建立桌面基线',
    };
  }

  const delta = currentScore - previousScore;

  if (currentScore < 55 || delta <= -12) {
    return {
      eventType: 'alert' as MonitorEventType,
      changeLabel: delta <= 0 ? `整洁度下降 ${Math.abs(delta)} 分` : '检测到高风险杂乱状态',
    };
  }

  if (delta <= -5) {
    return {
      eventType: 'declined' as MonitorEventType,
      changeLabel: `整洁度下降 ${Math.abs(delta)} 分`,
    };
  }

  if (delta >= 6) {
    return {
      eventType: 'improved' as MonitorEventType,
      changeLabel: `整洁度提升 ${delta} 分`,
    };
  }

  return {
    eventType: 'stable' as MonitorEventType,
    changeLabel: '桌面状态保持稳定',
  };
};

export const shouldSaveSnapshot = (eventType: MonitorEventType, isFirstFrame: boolean) =>
  isFirstFrame || eventType === 'alert' || eventType === 'declined' || eventType === 'manual_snapshot';
