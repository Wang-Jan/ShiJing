import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ActivityLog, ActivityLogKind, ActivityLogLevel } from '../types';
import { useToast } from '../src/toast';
import RecordDeleteBar from '../src/RecordDeleteBar';
import { useConfirm } from '../src/confirm';

interface AllActivitiesViewProps {
  authToken: string;
}

interface ActivitiesResponse {
  success: boolean;
  message?: string;
  activities?: ActivityLog[];
  deletedCount?: number;
}

const getActivityDot = (level: ActivityLog['level']) => {
  if (level === 'warn') {
    return 'bg-amber-400';
  }

  if (level === 'success') {
    return 'bg-emerald-400';
  }

  return 'bg-blue-400';
};

const kindLabel: Record<ActivityLogKind | 'all', string> = {
  all: '全部类型',
  analysis: '分析',
  task: '任务',
  verification: '验证',
  monitor: '监控',
  account: '账号',
};

const levelLabel: Record<ActivityLogLevel | 'all', string> = {
  all: '全部状态',
  info: '普通',
  success: '成功',
  warn: '提醒',
};

const AllActivitiesView: React.FC<AllActivitiesViewProps> = ({ authToken }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [kindFilter, setKindFilter] = useState<ActivityLogKind | 'all'>('all');
  const [levelFilter, setLevelFilter] = useState<ActivityLogLevel | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedActivities = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return activities
      .filter((item) => kindFilter === 'all' || item.kind === kindFilter)
      .filter((item) => levelFilter === 'all' || item.level === levelFilter)
      .filter((item) => {
        if (!normalizedKeyword) {
          return true;
        }

        return `${item.title} ${item.description}`.toLowerCase().includes(normalizedKeyword);
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
      });
  }, [activities, keyword, kindFilter, levelFilter, sortOrder]);

  const loadActivities = async (showSuccessToast = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/activities?limit=80', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = (await response.json().catch(() => null)) as ActivitiesResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '读取全部动态失败');
      }

      setActivities(data.activities ?? []);

      if (showSuccessToast) {
        toast.success('动态已刷新', `共读取 ${data.activities?.length ?? 0} 条记录`);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '读取全部动态失败';
      setError(message);
      toast.error('读取动态失败', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    const availableIds = new Set(activities.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [activities]);

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleDisplayedSelection = () => {
    const displayedIds = displayedActivities.map((item) => item.id);
    setSelectedIds((current) =>
      displayedIds.length > 0 && displayedIds.every((id) => current.includes(id)) ? [] : displayedIds
    );
  };

  const deleteActivities = async (all = false) => {
    const ids = selectedIds;

    if (!all && ids.length === 0) {
      toast.warn('请选择要删除的动态记录');
      return;
    }

    const confirmed = await confirm({
      title: all ? '删除全部动态记录' : '删除所选动态',
      message: all
        ? '该操作不受当前筛选条件限制，删除后无法恢复。'
        : `将删除已选择的 ${ids.length} 条动态记录，删除后无法恢复。`,
      confirmText: '删除',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/activities', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });

      const data = (await response.json().catch(() => null)) as ActivitiesResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '删除动态记录失败');
      }

      setSelectedIds([]);
      setSelectionMode(false);
      toast.success('动态记录已删除', `已删除 ${data.deletedCount ?? 0} 条记录`);
      await loadActivities();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除动态记录失败';
      setError(message);
      toast.error('删除动态记录失败', message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full border border-slate-100 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">全部动态</h2>
          <p className="mt-1 text-xs text-slate-400">集中查看分析、监控、任务和账号相关的最新记录。</p>
        </div>
        <button
          type="button"
          onClick={() => void loadActivities(true)}
          disabled={loading}
          className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={17} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索动态标题或描述"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as ActivityLogKind | 'all')}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          >
            {(Object.keys(kindLabel) as Array<ActivityLogKind | 'all'>).map((item) => (
              <option key={item} value={item}>
                {kindLabel[item]}
              </option>
            ))}
          </select>
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value as ActivityLogLevel | 'all')}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          >
            {(Object.keys(levelLabel) as Array<ActivityLogLevel | 'all'>).map((item) => (
              <option key={item} value={item}>
                {levelLabel[item]}
              </option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
          </select>
        </div>
      </section>

      <RecordDeleteBar
        totalCount={displayedActivities.length}
        selectedCount={selectedIds.length}
        selectionMode={selectionMode}
        disabled={loading || deleting}
        onToggleMode={toggleSelectionMode}
        onToggleAll={toggleDisplayedSelection}
        onDeleteSelected={() => void deleteActivities(false)}
        onDeleteAll={() => void deleteActivities(true)}
      />

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-red-100 bg-red-50 p-4 text-sm leading-relaxed text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => void loadActivities(true)} className="shrink-0 font-black text-red-700 dark:text-red-200">
            重试
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <p className="text-sm font-bold">正在加载动态记录...</p>
          </div>
        ) : displayedActivities.length === 0 ? (
          <div className="p-10 text-center italic text-slate-400">暂无符合条件的动态记录</div>
        ) : (
          displayedActivities.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 border-b border-slate-50 p-4 transition-colors last:border-0 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800"
            >
              {selectionMode ? (
                <button
                  type="button"
                  onClick={() => toggleSelected(item.id)}
                  className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                    selectedIds.includes(item.id)
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 text-transparent dark:border-slate-700'
                  }`}
                  aria-label="选择动态记录"
                >
                  ✓
                </button>
              ) : null}
              <div className="w-14 shrink-0 pt-1 text-[10px] font-bold uppercase text-slate-300 dark:text-slate-600">
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-bold text-slate-800 dark:text-slate-200">{item.title}</div>
                <div className="mt-0.5 break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.description}
                </div>
                {item.score !== undefined && item.score !== null ? (
                  <div className="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    评分：{item.score}
                  </div>
                ) : null}
              </div>
              <div className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${getActivityDot(item.level)}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AllActivitiesView;
