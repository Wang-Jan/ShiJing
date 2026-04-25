import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, ChevronLeft, Info, Loader2, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ActivityLogLevel, AppNotification } from '../types';
import { useToast } from '../src/toast';
import RecordDeleteBar from '../src/RecordDeleteBar';
import { useConfirm } from '../src/confirm';

interface NotificationsViewProps {
  authToken: string;
  onUnreadCountChange: (value: number) => void;
}

interface NotificationsResponse {
  success: boolean;
  message?: string;
  notifications?: AppNotification[];
  unreadCount?: number;
  deletedCount?: number;
}

const getNotificationIcon = (notification: AppNotification) => {
  if (notification.level === 'warn') {
    return <AlertTriangle size={18} />;
  }

  if (notification.level === 'success') {
    return <CheckCircle2 size={18} />;
  }

  return <Info size={18} />;
};

const getNotificationClassName = (notification: AppNotification) => {
  if (notification.level === 'warn') {
    return 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200';
  }

  if (notification.level === 'success') {
    return 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200';
  }

  return 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200';
};

const NotificationsView: React.FC<NotificationsViewProps> = ({ authToken, onUnreadCountChange }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [levelFilter, setLevelFilter] = useState<ActivityLogLevel | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedNotifications = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return notifications
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
  }, [keyword, levelFilter, notifications, sortOrder]);

  const loadNotifications = async (nextFilter = filter, showSuccessToast = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/notifications?limit=80${nextFilter === 'unread' ? '&status=unread' : ''}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = (await response.json().catch(() => null)) as NotificationsResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '读取通知失败');
      }

      setNotifications(data.notifications ?? []);
      setUnreadCount(Number(data.unreadCount ?? 0));
      onUnreadCountChange(Number(data.unreadCount ?? 0));

      if (showSuccessToast) {
        toast.success('通知已刷新', `当前未读 ${Number(data.unreadCount ?? 0)} 条`);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '读取通知失败';
      setError(message);
      toast.error('读取通知失败', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, filter]);

  useEffect(() => {
    const availableIds = new Set(notifications.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [notifications]);

  const markAsRead = async (ids?: string[]) => {
    setMarkingRead(true);
    setError(null);

    try {
      const response = await fetch('/api/notifications/read', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const data = (await response.json().catch(() => null)) as NotificationsResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '标记通知已读失败');
      }

      setUnreadCount(Number(data.unreadCount ?? 0));
      onUnreadCountChange(Number(data.unreadCount ?? 0));
      toast.success(ids ? '通知已标记为已读' : '全部通知已读');
      await loadNotifications(filter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '标记通知已读失败';
      setError(message);
      toast.error('标记通知失败', message);
    } finally {
      setMarkingRead(false);
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleDisplayedSelection = () => {
    const displayedIds = displayedNotifications.map((item) => item.id);
    setSelectedIds((current) =>
      displayedIds.length > 0 && displayedIds.every((id) => current.includes(id)) ? [] : displayedIds
    );
  };

  const deleteNotifications = async (all = false) => {
    const ids = selectedIds;

    if (!all && ids.length === 0) {
      toast.warn('请选择要删除的通知');
      return;
    }

    const confirmed = await confirm({
      title: all ? '删除全部通知' : '删除所选通知',
      message: all
        ? '该操作不受当前筛选条件限制，删除后无法恢复。'
        : `将删除已选择的 ${ids.length} 条通知，删除后无法恢复。`,
      confirmText: '删除',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });
      const data = (await response.json().catch(() => null)) as NotificationsResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '删除通知失败');
      }

      setSelectedIds([]);
      setSelectionMode(false);
      setUnreadCount(Number(data.unreadCount ?? 0));
      onUnreadCountChange(Number(data.unreadCount ?? 0));
      toast.success('通知记录已删除', `已删除 ${data.deletedCount ?? 0} 条记录`);
      await loadNotifications(filter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除通知失败';
      setError(message);
      toast.error('删除通知失败', message);
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
          <h2 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">通知中心</h2>
          <p className="mt-1 text-xs text-slate-400">集中处理分析、任务闭环、监控风险和账户安全提醒。</p>
        </div>
        <button
          type="button"
          onClick={() => void loadNotifications(filter, true)}
          disabled={loading}
          className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      <section className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">
              <Bell size={13} />
              系统通知
            </div>
            <h3 className="mt-4 text-2xl font-black">未读通知 {unreadCount}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              关键事件会从动态流中沉淀为通知，方便比赛展示时快速说明系统正在持续追踪桌面状态。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markAsRead()}
            disabled={markingRead || unreadCount === 0}
            className="shrink-0 rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-50"
          >
            {markingRead ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
          </button>
        </div>
      </section>

      <section className="flex gap-2">
        {(['all', 'unread'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-full px-4 py-2 text-xs font-black transition-colors ${
              filter === item
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {item === 'all' ? '全部通知' : '仅未读'}
          </button>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={17} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索通知标题或描述"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value as ActivityLogLevel | 'all')}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">全部状态</option>
            <option value="info">普通通知</option>
            <option value="success">成功通知</option>
            <option value="warn">风险提醒</option>
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
        totalCount={displayedNotifications.length}
        selectedCount={selectedIds.length}
        selectionMode={selectionMode}
        disabled={loading || deleting}
        onToggleMode={toggleSelectionMode}
        onToggleAll={toggleDisplayedSelection}
        onDeleteSelected={() => void deleteNotifications(false)}
        onDeleteAll={() => void deleteNotifications(true)}
      />

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-red-100 bg-red-50 p-4 text-sm leading-relaxed text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => void loadNotifications(filter, true)} className="shrink-0 font-black">
            重试
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <p className="text-sm font-bold">正在加载通知...</p>
          </div>
        ) : displayedNotifications.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="mx-auto text-slate-300 dark:text-slate-600" size={34} />
            <h3 className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">暂无通知</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              完成分析、监控或任务验证后，关键提醒会自动进入这里。
            </p>
          </div>
        ) : (
          displayedNotifications.map((item) => (
            <article
              key={item.id}
              className={`border-b border-slate-50 p-4 last:border-0 dark:border-slate-800 ${
                item.readAt ? 'opacity-70' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                {selectionMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelected(item.id)}
                    className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                      selectedIds.includes(item.id)
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 text-transparent dark:border-slate-700'
                    }`}
                    aria-label="选择通知"
                  >
                    ✓
                  </button>
                ) : null}
                <div
                  className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${getNotificationClassName(
                    item
                  )}`}
                >
                  {getNotificationIcon(item)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="break-words text-sm font-black text-slate-900 dark:text-slate-100">{item.title}</h3>
                      <p className="mt-1 break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {item.description}
                      </p>
                    </div>
                    {!item.readAt ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    {!item.readAt ? (
                      <button
                        type="button"
                        onClick={() => void markAsRead([item.id])}
                        disabled={markingRead}
                        className="font-black text-blue-600 disabled:opacity-50 dark:text-blue-400"
                      >
                        标记已读
                      </button>
                    ) : (
                      <span>已读</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
};

export default NotificationsView;
