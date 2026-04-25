import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  Radar,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { ActivityLog, DashboardStats, MonitorEvent, MonitorSessionSummary } from '../types';
import { isLikelyNetworkError } from '../src/apiClient';

interface HomeViewProps {
  authToken: string;
  monitorSession: MonitorSessionSummary | null;
  monitorEvents: MonitorEvent[];
  onUnreadCountChange: (value: number) => void;
}

interface DashboardResponse {
  success: boolean;
  message?: string;
  stats?: DashboardStats;
  activities?: ActivityLog[];
}

const DASHBOARD_CACHE_KEY = 'shijing_dashboard_cache';

const readDashboardCache = () => {
  try {
    const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
    return cached ? (JSON.parse(cached) as { stats: DashboardStats; activities: ActivityLog[] }) : null;
  } catch {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    return null;
  }
};

const getScoreTone = (score: number | null) => {
  if (score === null) {
    return {
      label: '等待建立基线',
      text: 'text-slate-400',
      bg: 'bg-slate-100 dark:bg-slate-800',
      ring: 'from-slate-300 to-slate-500',
      hint: '启动监控或完成一次图片分析后，系统会自动建立桌面整洁度基线。',
    };
  }

  if (score >= 80) {
    return {
      label: '环境良好',
      text: 'text-emerald-600 dark:text-emerald-300',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      ring: 'from-emerald-400 to-teal-500',
      hint: '当前桌面状态较稳定，可以继续保持。',
    };
  }

  if (score >= 60) {
    return {
      label: '建议整理',
      text: 'text-amber-600 dark:text-amber-300',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      ring: 'from-amber-400 to-orange-500',
      hint: '桌面存在一定杂物堆积，建议完成一次快速整理。',
    };
  }

  return {
    label: '需要处理',
    text: 'text-red-600 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-900/20',
    ring: 'from-red-400 to-rose-600',
    hint: '当前桌面整洁度较低，建议优先处理高风险区域。',
  };
};

const getMonitorStatusLabel = (session: MonitorSessionSummary | null) => {
  if (!session) {
    return '未启动';
  }

  if (session.status === 'monitoring') {
    return '监控中';
  }

  if (session.status === 'paused') {
    return '已暂停';
  }

  if (session.status === 'stopped') {
    return '已结束';
  }

  return '准备中';
};

const getActivityDot = (level: ActivityLog['level']) => {
  if (level === 'warn') {
    return 'bg-amber-400';
  }

  if (level === 'success') {
    return 'bg-emerald-400';
  }

  return 'bg-blue-400';
};

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="text-blue-500">{icon}</div>
    </div>
    <div className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">{value}</div>
    <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p>
  </div>
);

const QuickActionCard: React.FC<{
  title: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: string;
}> = ({ title, desc, icon, onClick, tone }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-all active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900"
  >
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
    <div className="mt-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-black text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{desc}</p>
      </div>
      <ArrowUpRight size={16} className="shrink-0 text-slate-300" />
    </div>
  </button>
);

const HomeView: React.FC<HomeViewProps> = ({ authToken, monitorSession, monitorEvents, onUnreadCountChange }) => {
  const navigate = useNavigate();
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/dashboard', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const data = (await response.json().catch(() => null)) as DashboardResponse | null;

        if (!response.ok || !data?.success || !data.stats) {
          throw new Error(data?.message || '读取首页驾驶舱数据失败');
        }

        setDashboardStats(data.stats);
        onUnreadCountChange(data.stats.unreadNotificationCount);
        setActivities(data.activities ?? []);
        localStorage.setItem(
          DASHBOARD_CACHE_KEY,
          JSON.stringify({
            stats: data.stats,
            activities: data.activities ?? [],
          })
        );
      } catch (requestError) {
        const cached = readDashboardCache();

        if (cached && isLikelyNetworkError(requestError)) {
          setDashboardStats(cached.stats);
          setActivities(cached.activities);
          onUnreadCountChange(cached.stats.unreadNotificationCount);
          setError('当前为离线模式，首页正在显示上次同步的数据。');
          return;
        }

        const message = requestError instanceof Error ? requestError.message : '读取首页驾驶舱数据失败';
        setError(isLikelyNetworkError(requestError) ? '无法连接到后端服务，请检查网络后重试。' : message);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [authToken, onUnreadCountChange]);

  const recentMonitorEvents = monitorEvents.slice(0, 3);
  const latestScore = dashboardStats?.latestDeskScore ?? monitorSession?.latestScore ?? null;
  const scoreTone = getScoreTone(latestScore);
  const monitorStatus = getMonitorStatusLabel(monitorSession);
  const isMonitoring = monitorSession?.status === 'monitoring';
  const scoreTrend = dashboardStats?.scoreTrend ?? [];

  return (
    <div className="space-y-6 p-4 pb-24">
      <section className="relative overflow-hidden rounded-[2.25rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-200 dark:shadow-none">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">
                <Radar size={13} />
                桌面中枢
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight">桌面环境驾驶舱</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                通过 Garden 视觉理解、实时监控和任务闭环，把桌面状态从“发现问题”推进到“持续改善”。
              </p>
            </div>

            <div className="shrink-0 text-center">
              <div className={`h-24 w-24 rounded-[1.75rem] bg-gradient-to-br ${scoreTone.ring} p-[1px]`}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-[1.7rem] bg-slate-950/90">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400">评分</span>
                  <span className="text-3xl font-black italic">{latestScore ?? '--'}</span>
                </div>
              </div>
              <div className={`mt-2 rounded-full px-3 py-1 text-[10px] font-black ${scoreTone.bg} ${scoreTone.text}`}>
                {scoreTone.label}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('/live')}
              className="rounded-2xl bg-white py-3 text-sm font-black text-slate-950 transition-all active:scale-95"
            >
              开始实时监控
            </button>
            <button
              type="button"
              onClick={() => navigate('/ai')}
              className="rounded-2xl border border-white/15 bg-white/10 py-3 text-sm font-black text-white transition-all active:scale-95"
            >
              上传图片诊断
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-4 text-sm leading-relaxed text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-4">
        <MetricCard
          label="监控状态"
          value={monitorStatus}
          hint={isMonitoring ? `每 ${monitorSession?.captureIntervalSeconds ?? 8} 秒采样一次` : '可进入监控页启动摄像头'}
          icon={<Camera size={18} />}
        />
        <MetricCard
          label="今日分析"
          value={dashboardStats?.todayAnalysisCount ?? '--'}
          hint="统计今天完成的图片诊断次数"
          icon={<Sparkles size={18} />}
        />
        <MetricCard
          label="今日任务"
          value={dashboardStats?.todayTaskCreatedCount ?? '--'}
          hint="今天新增的清洁任务数量"
          icon={<ClipboardList size={18} />}
        />
        <MetricCard
          label="任务完成率"
          value={dashboardStats ? `${dashboardStats.taskCompletionRate}%` : '--'}
          hint={`待处理 ${dashboardStats?.pendingTaskCount ?? 0} / 执行中 ${dashboardStats?.runningTaskCount ?? 0}`}
          icon={<ClipboardList size={18} />}
        />
        <MetricCard
          label="本周完成"
          value={dashboardStats?.weeklyCompletedTaskCount ?? '--'}
          hint={`累计已验证 ${dashboardStats?.verifiedTaskCount ?? 0} 个任务`}
          icon={<CheckCircle2 size={18} />}
        />
        <MetricCard
          label="平均改善"
          value={
            dashboardStats?.averageImprovement === null || dashboardStats?.averageImprovement === undefined
              ? '--'
              : `${dashboardStats.averageImprovement > 0 ? '+' : ''}${dashboardStats.averageImprovement}`
          }
          hint="基于任务前后对比验证结果"
          icon={<TrendingUp size={18} />}
        />
        <MetricCard
          label="高风险提醒"
          value={dashboardStats?.highRiskEventCount ?? '--'}
          hint="近 7 天内监控发现的高风险桌面事件"
          icon={<TriangleAlert size={18} />}
        />
        <MetricCard
          label="未读通知"
          value={dashboardStats?.unreadNotificationCount ?? '--'}
          hint={`近 7 天监控会话 ${dashboardStats?.monitorSessionCount ?? 0} 次`}
          icon={<Bell size={18} />}
        />
      </section>

      <section className="grid grid-cols-2 gap-4">
        <QuickActionCard
          title="实时监控"
          desc="使用电脑摄像头持续跟踪桌面变化。"
          icon={<Camera size={20} />}
          tone="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
          onClick={() => navigate('/live')}
        />
        <QuickActionCard
          title="智能分析"
          desc="上传图片，生成正式桌面诊断报告。"
          icon={<Sparkles size={20} />}
          tone="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300"
          onClick={() => navigate('/ai')}
        />
        <QuickActionCard
          title="任务中心"
          desc="管理系统生成的清洁任务与验证记录。"
          icon={<ClipboardList size={20} />}
          tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
          onClick={() => navigate('/robot')}
        />
        <QuickActionCard
          title="历史报告"
          desc="查看监控趋势、关键快照和风险回放。"
          icon={<TrendingUp size={20} />}
          tone="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300"
          onClick={() => navigate('/monitor-history')}
        />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
              <Activity size={18} className="text-blue-500 dark:text-blue-400" />
              改善趋势
            </h2>
            <p className="mt-1 text-xs text-slate-400">最近 7 天的分析评分与任务验证变化</p>
          </div>
          {loading ? <Loader2 size={18} className="animate-spin text-blue-500" /> : null}
        </div>

        {scoreTrend.length > 0 ? (
          <div className="space-y-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">近 7 天平均分</div>
                <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                  {dashboardStats?.weeklyAverageScore ?? '--'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">平均改善值</div>
                <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                  {dashboardStats?.averageImprovement === null || dashboardStats?.averageImprovement === undefined
                    ? '--'
                    : `${dashboardStats.averageImprovement > 0 ? '+' : ''}${dashboardStats.averageImprovement}`}
                </div>
              </div>
            </div>

            <div className="flex h-28 items-end gap-2">
              {scoreTrend.map((item) => (
                <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-20 w-full items-end justify-center gap-1">
                    <div
                      className="w-3 rounded-t-xl bg-blue-500"
                      style={{ height: `${Math.max(10, Math.round(item.averageScore ?? 0))}%` }}
                    />
                    <div
                      className="w-3 rounded-t-xl bg-emerald-500"
                      style={{
                        height: `${Math.max(8, Math.min(100, Math.round(((item.averageDelta ?? 0) + 20) * 2.2)))}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400">{item.date.slice(5)}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                平均评分
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                平均改善值
              </span>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
              <TrendingUp className="mx-auto text-slate-300 dark:text-slate-600" size={30} />
              <p className="mt-3 text-sm font-bold text-slate-400">趋势数据还在积累</p>
              <p className="mt-1 text-xs text-slate-400">完成几次分析或整理后验证后，这里会自动展示变化趋势。</p>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
              <TrendingUp size={18} className="text-blue-500 dark:text-blue-400" />
              监控事件
            </h2>
            <p className="mt-1 text-xs text-slate-400">摄像头监控过程中记录的桌面变化</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/monitor-history')}
            className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-600 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300"
          >
            <span className="flex items-center gap-1">
              历史报告 <ChevronRight size={12} />
            </span>
          </button>
        </div>

        {recentMonitorEvents.length > 0 ? (
          <div className="space-y-3 px-4 pb-4">
            {recentMonitorEvents.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-bold text-slate-900 dark:text-slate-100">{item.event}</div>
                    <div className="mt-1 break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.action}</div>
                  </div>
                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      item.riskLevel === 'high'
                        ? 'border border-red-100 bg-red-50 text-red-600'
                        : item.riskLevel === 'medium'
                          ? 'border border-amber-100 bg-amber-50 text-amber-600'
                          : 'border border-emerald-100 bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {item.changeLabel}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  <span>评分 {item.score}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
              <Camera className="mx-auto text-slate-300 dark:text-slate-600" size={30} />
              <p className="mt-3 text-sm font-bold text-slate-400">还没有监控事件</p>
              <p className="mt-1 text-xs text-slate-400">启动实时监控后，桌面变化会在这里持续更新。</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm dark:border-blue-900/40 dark:bg-blue-900/20">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-blue-900 dark:text-blue-100">
              <Bell size={18} />
              通知中心
            </h2>
            {dashboardStats?.latestUnreadNotification ? (
              <div className="mt-3">
                <p className="break-words text-sm font-black text-slate-900 dark:text-slate-100">
                  {dashboardStats.latestUnreadNotification.title}
                </p>
                <p className="mt-1 break-words text-xs leading-relaxed text-blue-900/70 dark:text-blue-100/80">
                  {dashboardStats.latestUnreadNotification.description}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-blue-900/70 dark:text-blue-100/80">
                暂无未读关键提醒。后续分析、监控风险和任务验证会自动沉淀到这里。
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="shrink-0 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black text-white"
          >
            {dashboardStats?.unreadNotificationCount ?? 0} 未读
          </button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
            <Bell size={18} className="text-blue-500 dark:text-blue-400" />
            最新动态
          </h2>
          <button
            type="button"
            onClick={() => navigate('/all-activities')}
            className="flex items-center text-xs font-bold text-slate-400 dark:text-slate-500"
          >
            查看全部 <ChevronRight size={14} />
          </button>
        </div>

        {activities.length > 0 ? (
          <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {activities.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 border-b border-slate-50 p-4 transition-colors last:border-0 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800"
              >
                <div className="w-12 shrink-0 pt-1 text-[10px] font-bold uppercase text-slate-300 dark:text-slate-600">
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-bold text-slate-800 dark:text-slate-200">{item.title}</div>
                  <div className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{item.description}</div>
                </div>
                <div className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${getActivityDot(item.level)}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <CheckCircle2 className="text-slate-300 dark:text-slate-600" size={30} />
            <h3 className="mt-3 text-sm font-bold text-slate-400 dark:text-slate-500">等待新的系统动态</h3>
            <p className="mt-1 text-xs text-slate-300 dark:text-slate-600">
              完成图片分析、实时监控或任务验证后，这里会同步展示最新记录。
            </p>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          <Sparkles size={14} />
          Garden 核心优势
        </div>
        <h3 className="mt-2 text-lg font-black">从单次识别升级为持续环境理解</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          系统会持续分析桌面变化、记录风险节点，并自动生成清洁任务和验证结果，让模型能力从“看图回答”转化为可追踪、可执行的产品流程。
        </p>
      </section>
    </div>
  );
};

export default HomeView;
