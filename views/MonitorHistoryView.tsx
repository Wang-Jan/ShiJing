import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Clock3,
  History,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { MonitorEvent, MonitorSessionSummary } from '../types';
import { useToast } from '../src/toast';
import RecordDeleteBar from '../src/RecordDeleteBar';
import { useConfirm } from '../src/confirm';

interface MonitorHistoryViewProps {
  authToken: string;
}

interface MonitorSessionsResponse {
  success: boolean;
  message?: string;
  sessions?: MonitorSessionSummary[];
  deletedCount?: number;
}

interface MonitorSummaryResponse {
  success: boolean;
  message?: string;
  session?: MonitorSessionSummary;
  events?: MonitorEvent[];
}

interface DerivedStats {
  highestScore: number | null;
  lowestScore: number | null;
  firstScore: number | null;
  lastScore: number | null;
  scoreDelta: number | null;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  improvedCount: number;
  declinedCount: number;
  snapshotCount: number;
}

const readErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message || '请求失败';
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleString();
};

const formatDuration = (startedAt?: string | null, endedAt?: string | null) => {
  if (!startedAt) {
    return '--';
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes <= 0) {
    return `${seconds} 秒`;
  }

  return `${minutes} 分 ${seconds} 秒`;
};

const getRiskBadge = (event: MonitorEvent) => {
  if (event.riskLevel === 'high') {
    return 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40';
  }

  if (event.riskLevel === 'medium') {
    return 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40';
  }

  return 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40';
};

const getSessionStatusLabel = (session: MonitorSessionSummary) => {
  if (session.status === 'monitoring') {
    return '监控中';
  }

  if (session.status === 'paused') {
    return '已暂停';
  }

  if (session.status === 'stopped') {
    return '已结束';
  }

  if (session.status === 'starting') {
    return '启动中';
  }

  return '空闲';
};

const calculateStats = (events: MonitorEvent[]): DerivedStats => {
  if (events.length === 0) {
    return {
      highestScore: null,
      lowestScore: null,
      firstScore: null,
      lastScore: null,
      scoreDelta: null,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      improvedCount: 0,
      declinedCount: 0,
      snapshotCount: 0,
    };
  }

  const chronologicalEvents = [...events].reverse();
  const scores = chronologicalEvents.map((item) => item.score);
  const firstScore = scores[0];
  const lastScore = scores[scores.length - 1];

  return {
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    firstScore,
    lastScore,
    scoreDelta: lastScore - firstScore,
    highRiskCount: events.filter((item) => item.riskLevel === 'high').length,
    mediumRiskCount: events.filter((item) => item.riskLevel === 'medium').length,
    lowRiskCount: events.filter((item) => item.riskLevel === 'low').length,
    improvedCount: events.filter((item) => item.eventType === 'improved').length,
    declinedCount: events.filter((item) => item.eventType === 'declined' || item.eventType === 'alert').length,
    snapshotCount: events.filter((item) => Boolean(item.snapshot)).length,
  };
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {icon}
      {label}
    </div>
    <div className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">{value}</div>
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{hint}</p>
  </div>
);

const MonitorHistoryView: React.FC<MonitorHistoryViewProps> = ({ authToken }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<MonitorSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<MonitorSessionSummary | null>(null);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = calculateStats(events);
  const chronologicalEvents = [...events].reverse();
  const snapshots = events.filter((item) => item.snapshot).slice(0, 6);

  const loadSessionSummary = async (sessionId: string) => {
    setLoadingSummary(true);
    setError(null);

    try {
      const response = await fetch(`/api/monitor/session/${sessionId}/summary`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as MonitorSummaryResponse;

      if (!data.success || !data.session) {
        throw new Error(data.message || '读取监控报告失败');
      }

      setSelectedSession(data.session);
      setEvents(data.events ?? []);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '读取监控报告失败';
      setError(message);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    setError(null);

    try {
      const response = await fetch('/api/monitor/sessions?limit=30', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as MonitorSessionsResponse;

      if (!data.success) {
        throw new Error(data.message || '读取监控历史失败');
      }

      const nextSessions = data.sessions ?? [];
      setSessions(nextSessions);

      if (nextSessions[0]) {
        await loadSessionSummary(nextSessions[0].sessionId);
      } else {
        setSelectedSession(null);
        setEvents([]);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '读取监控历史失败';
      setError(message);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    const availableIds = new Set(sessions.map((item) => item.sessionId));
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [sessions]);

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleAllSessions = () => {
    const sessionIds = sessions.map((item) => item.sessionId);
    setSelectedIds((current) =>
      sessionIds.length > 0 && sessionIds.every((id) => current.includes(id)) ? [] : sessionIds
    );
  };

  const deleteSessions = async (all = false) => {
    const ids = selectedIds;

    if (!all && ids.length === 0) {
      toast.warn('请选择要删除的监控会话');
      return;
    }

    const confirmed = await confirm({
      title: all ? '删除全部监控历史' : '删除所选监控会话',
      message: all
        ? '会话下的事件与快照也会同步删除，删除后无法恢复。'
        : `将删除已选择的 ${ids.length} 条监控会话，删除后无法恢复。`,
      confirmText: '删除',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/monitor/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });

      const data = (await response.json().catch(() => null)) as MonitorSessionsResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '删除监控历史失败');
      }

      setSelectedIds([]);
      setSelectionMode(false);
      toast.success('监控历史已删除', `已删除 ${data.deletedCount ?? 0} 条会话`);
      await loadSessions();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除监控历史失败';
      setError(message);
      toast.error('删除监控历史失败', message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 pb-24 space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-5 overflow-hidden relative">
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-blue-500/20 blur-2xl" />
        <div className="relative">
          <Link to="/live" className="inline-flex items-center gap-2 text-xs text-slate-300 font-bold mb-5">
            <ArrowLeft size={14} />
            返回实时监控
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-blue-200">
                <History size={15} />
                监控档案
              </div>
              <h2 className="mt-3 text-2xl font-black">监控历史报告</h2>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                汇总每次桌面监控会话，展示评分趋势、风险节点、关键快照和 Garden 给出的整理建议。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="shrink-0 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-xs font-bold"
            >
              刷新
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 text-red-700 p-4 text-sm leading-relaxed dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-slate-900 dark:text-slate-100">监控会话</h3>
            <p className="text-xs text-slate-400 mt-1">按开始时间倒序展示最近 30 次会话</p>
          </div>
          {loadingSessions ? <Loader2 size={18} className="animate-spin text-blue-500" /> : null}
        </div>

        <RecordDeleteBar
          totalCount={sessions.length}
          selectedCount={selectedIds.length}
          selectionMode={selectionMode}
          disabled={loadingSessions || deleting}
          onToggleMode={toggleSelectionMode}
          onToggleAll={toggleAllSessions}
          onDeleteSelected={() => void deleteSessions(false)}
          onDeleteAll={() => void deleteSessions(true)}
        />

        {sessions.length > 0 ? (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {sessions.map((session) => {
              const isActive = selectedSession?.sessionId === session.sessionId;
              const isSelected = selectedIds.includes(session.sessionId);

              return (
                <button
                  type="button"
                  key={session.sessionId}
                  onClick={() => (selectionMode ? toggleSelected(session.sessionId) : void loadSessionSummary(session.sessionId))}
                  className={`min-w-[220px] text-left rounded-3xl border p-4 transition-all ${
                    isSelected
                      ? 'bg-slate-950 text-white border-slate-950 shadow-lg shadow-slate-100 dark:shadow-none'
                      : isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 dark:shadow-none'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${isActive || isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                      {getSessionStatusLabel(session)}
                    </div>
                    {selectionMode ? (
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                          isSelected ? 'border-white bg-white text-slate-950' : 'border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm font-black truncate">{session.deviceName}</div>
                  <div className={`mt-1 text-xs ${isActive || isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {formatDateTime(session.startedAt)}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs">事件 {session.eventCount}</span>
                    <span className="text-xs">评分 {session.latestScore ?? '--'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center">
            <Camera className="mx-auto text-slate-300 dark:text-slate-600" size={32} />
            <p className="mt-3 text-sm font-bold text-slate-400">暂无监控历史</p>
            <p className="mt-1 text-xs text-slate-400">进入实时监控页启动一次会话后，这里会生成历史报告。</p>
          </div>
        )}
      </section>

      {selectedSession ? (
        <>
          <section className="grid grid-cols-2 gap-4">
            <StatCard
              label="平均评分"
              value={selectedSession.averageScore !== null && selectedSession.averageScore !== undefined ? selectedSession.averageScore.toFixed(1) : '--'}
              hint={`基线 ${selectedSession.baselineScore ?? '--'}，最新 ${selectedSession.latestScore ?? '--'}`}
              icon={<ShieldCheck size={15} className="text-blue-500" />}
            />
            <StatCard
              label="分数变化"
              value={stats.scoreDelta !== null ? `${stats.scoreDelta > 0 ? '+' : ''}${stats.scoreDelta}` : '--'}
              hint={`最高 ${stats.highestScore ?? '--'}，最低 ${stats.lowestScore ?? '--'}`}
              icon={stats.scoreDelta !== null && stats.scoreDelta < 0 ? <TrendingDown size={15} className="text-red-500" /> : <TrendingUp size={15} className="text-emerald-500" />}
            />
            <StatCard
              label="高风险"
              value={stats.highRiskCount}
              hint={`中风险 ${stats.mediumRiskCount}，低风险 ${stats.lowRiskCount}`}
              icon={<AlertTriangle size={15} className="text-amber-500" />}
            />
            <StatCard
              label="会话时长"
              value={formatDuration(selectedSession.startedAt, selectedSession.endedAt)}
              hint={`快照 ${stats.snapshotCount} 张，事件 ${events.length} 条`}
              icon={<Clock3 size={15} className="text-violet-500" />}
            />
          </section>

          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-slate-900 dark:text-slate-100">评分趋势</h3>
                <p className="text-xs text-slate-400 mt-1">按时间顺序展示该监控会话的桌面整洁度变化</p>
              </div>
              {loadingSummary ? <Loader2 size={18} className="animate-spin text-blue-500" /> : null}
            </div>

            {chronologicalEvents.length > 0 ? (
              <div className="h-44 flex items-end gap-2">
                {chronologicalEvents.map((item) => (
                  <div key={item.id} className="flex-1 min-w-[18px] flex flex-col items-center justify-end gap-2">
                    <div
                      className={`w-full rounded-t-2xl ${
                        item.riskLevel === 'high'
                          ? 'bg-red-400'
                          : item.riskLevel === 'medium'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                      }`}
                      style={{ height: `${Math.max(12, item.score)}%` }}
                      title={`${item.score} 分`}
                    />
                    <span className="text-[10px] text-slate-400">{item.score}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
                该会话暂无可绘制的趋势数据。
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-slate-900 dark:text-slate-100">关键快照</h3>
                <p className="text-xs text-slate-400 mt-1">系统会保留基线、高风险和明显下降节点的画面</p>
              </div>
              <ImageIcon size={18} className="text-slate-400" />
            </div>

            {snapshots.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {snapshots.map((item) => (
                  <div key={item.id} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <img src={item.snapshot ?? ''} alt="监控快照" className="w-full h-28 object-cover" />
                    <div className="p-3">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">评分 {item.score}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{new Date(item.createdAt).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
                暂无关键快照。
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
            <h3 className="font-black text-slate-900 dark:text-slate-100 mb-4">事件回放</h3>
            {events.length > 0 ? (
              <div className="space-y-3">
                {events.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.event}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{item.action}</p>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-bold ${getRiskBadge(item)}`}>
                        {item.changeLabel}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{formatDateTime(item.createdAt)}</span>
                      <span>评分 {item.score}</span>
                      <span>风险 {item.riskLevel}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
                该会话暂无事件。
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default MonitorHistoryView;
