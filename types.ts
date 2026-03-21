
export enum DeviceStatus {
  ONLINE = '在线',
  OFFLINE = '离线',
  WORKING = '工作中',
  IDLE = '待命'
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

export interface RobotTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed';
  timestamp: string;
}
