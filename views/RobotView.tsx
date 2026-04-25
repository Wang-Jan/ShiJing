import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  ImagePlus,
  ListChecks,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  CleaningTask,
  CleaningTaskPriority,
  CleaningTaskStatus,
  CleaningTaskVerification,
  Suggestion,
} from '../types';
import { useToast } from '../src/toast';
import RecordDeleteBar from '../src/RecordDeleteBar';
import { useConfirm } from '../src/confirm';

interface RobotViewProps {
  authToken: string;
}

interface TasksResponse {
  success: boolean;
  message?: string;
  tasks?: CleaningTask[];
  task?: CleaningTask;
  deletedCount?: number;
}

interface VerificationAnalysisResult {
  score: number;
  event: string;
  action: string;
  suggestions: Suggestion[];
}

interface TaskVerificationResponse {
  success: boolean;
  message?: string;
  code?: string;
  details?: string;
  task?: CleaningTask;
  verification?: CleaningTaskVerification;
  result?: VerificationAnalysisResult;
}

const priorityMeta: Record<CleaningTaskPriority, { label: string; className: string }> = {
  high: {
    label: '高优先级',
    className: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40',
  },
  medium: {
    label: '中优先级',
    className: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40',
  },
  low: {
    label: '低优先级',
    className: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40',
  },
};

const statusMeta: Record<CleaningTaskStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: '待处理',
    icon: <Clock3 size={13} />,
    className: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  running: {
    label: '执行中',
    icon: <Loader2 size={13} className="animate-spin" />,
    className: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-900/40',
  },
  completed: {
    label: '已完成',
    icon: <CheckCircle2 size={13} />,
    className: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40',
  },
  ignored: {
    label: '已忽略',
    icon: <XCircle size={13} />,
    className: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-300 dark:border-zinc-800',
  },
};

const sourceLabel: Record<CleaningTask['sourceType'], string> = {
  manual: '手动创建',
  analysis: '图片分析生成',
  monitor: '实时监控生成',
};

const readErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message || '请求失败';
};

const formatDateTime = (value: string) => new Date(value).toLocaleString();

const getDeltaMeta = (delta: number | null | undefined) => {
  if (delta === null || delta === undefined) {
    return {
      label: '待比较',
      icon: <Minus size={14} />,
      className: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
  }

  if (delta > 0) {
    return {
      label: `改善 +${delta}`,
      icon: <TrendingUp size={14} />,
      className: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40',
    };
  }

  if (delta < 0) {
    return {
      label: `回落 ${delta}`,
      icon: <TrendingDown size={14} />,
      className: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40',
    };
  }

  return {
    label: '保持不变',
    icon: <Minus size={14} />,
    className: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40',
  };
};

const formatDeltaValue = (delta: number | null | undefined) => {
  if (delta === null || delta === undefined) {
    return '--';
  }

  return delta > 0 ? `+${delta}` : `${delta}`;
};

const canVerifyTask = (task: CleaningTask) => task.score !== null && task.score !== undefined && Boolean(task.imageUrl);

const priorityOrder: Record<CleaningTaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const RobotView: React.FC<RobotViewProps> = ({ authToken }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskKeyword, setTaskKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<CleaningTaskStatus | 'active' | 'all'>('active');
  const [priorityFilter, setPriorityFilter] = useState<CleaningTaskPriority | 'all'>('all');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'priority'>('priority');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingTasks, setDeletingTasks] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CleaningTaskPriority>('medium');
  const [verificationTask, setVerificationTask] = useState<CleaningTask | null>(null);
  const [verificationPreview, setVerificationPreview] = useState<string | null>(null);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<CleaningTaskVerification | null>(null);
  const [verificationAnalysis, setVerificationAnalysis] = useState<VerificationAnalysisResult | null>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);

  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const runningCount = tasks.filter((task) => task.status === 'running').length;
  const verifiedTasks = tasks.filter((task) => task.latestVerification);
  const improvedTasks = verifiedTasks.filter((task) => (task.latestVerification?.scoreDelta ?? 0) > 0).length;
  const averageDeltaSource = verifiedTasks
    .map((task) => task.latestVerification?.scoreDelta)
    .filter((delta): delta is number => typeof delta === 'number');
  const averageDelta =
    averageDeltaSource.length > 0
      ? Number((averageDeltaSource.reduce((sum, delta) => sum + delta, 0) / averageDeltaSource.length).toFixed(1))
      : null;
  const filteredTasks = useMemo(() => {
    const normalizedKeyword = taskKeyword.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (statusFilter === 'all') {
          return true;
        }

        if (statusFilter === 'active') {
          return task.status === 'pending' || task.status === 'running';
        }

        return task.status === statusFilter;
      })
      .filter((task) => priorityFilter === 'all' || task.priority === priorityFilter)
      .filter((task) => {
        if (!normalizedKeyword) {
          return true;
        }

        return `${task.title} ${task.description}`.toLowerCase().includes(normalizedKeyword);
      })
      .sort((a, b) => {
        if (sortMode === 'priority') {
          const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];

          if (priorityDelta !== 0) {
            return priorityDelta;
          }
        }

        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sortMode === 'oldest' ? aTime - bTime : bTime - aTime;
      });
  }, [priorityFilter, sortMode, statusFilter, taskKeyword, tasks]);
  const activeTasks = filteredTasks.filter((task) => task.status === 'pending' || task.status === 'running');
  const archivedTasks = filteredTasks.filter((task) => task.status === 'completed' || task.status === 'ignored').slice(0, 6);

  const syncTask = (nextTask: CleaningTask) => {
    setTasks((prev) => prev.map((task) => (task.id === nextTask.id ? nextTask : task)));
    setVerificationTask((current) => (current?.id === nextTask.id ? nextTask : current));
  };

  const resetVerificationState = () => {
    setVerificationPreview(null);
    setVerificationError(null);
    setVerificationResult(null);
    setVerificationAnalysis(null);
    setVerificationSubmitting(false);
  };

  const closeVerificationModal = () => {
    setVerificationTask(null);
    resetVerificationState();
  };

  const loadTasks = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as TasksResponse;

      if (!data.success) {
        throw new Error(data.message || '读取任务失败');
      }

      setTasks(data.tasks ?? []);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '读取任务失败';
      setError(message);
      toast.error('读取任务失败', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    const availableIds = new Set(tasks.map((task) => task.id));
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [tasks]);

  const createManualTask = async () => {
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!normalizedTitle || !normalizedDescription) {
      setError('请填写任务标题和任务说明');
      toast.warn('任务信息不完整', '请填写任务标题和任务说明');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: normalizedTitle,
          description: normalizedDescription,
          priority,
          sourceType: 'manual',
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as TasksResponse;

      if (!data.success || !data.task) {
        throw new Error(data.message || '创建任务失败');
      }

      setTasks((prev) => [data.task as CleaningTask, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('medium');
      toast.success('任务已创建', normalizedTitle);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '创建任务失败';
      setError(message);
      toast.error('创建任务失败', message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: CleaningTaskStatus) => {
    setUpdatingTaskId(taskId);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as TasksResponse;

      if (!data.success || !data.task) {
        throw new Error(data.message || '更新任务失败');
      }

      syncTask(data.task as CleaningTask);
      toast.success('任务状态已更新', statusMeta[status].label);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '更新任务失败';
      setError(message);
      toast.error('更新任务失败', message);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const deleteTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    const confirmed = await confirm({
      title: '删除清洁任务',
      message: `确认删除“${task?.title ?? '当前任务'}”？相关前后验证记录也会同步删除。`,
      confirmText: '删除',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    setUpdatingTaskId(taskId);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      setSelectedIds((prev) => prev.filter((id) => id !== taskId));

      if (verificationTask?.id === taskId) {
        closeVerificationModal();
      }
      toast.success('任务已删除');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除任务失败';
      setError(message);
      toast.error('删除任务失败', message);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds([]);
  };

  const toggleSelected = (taskId: string) => {
    setSelectedIds((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]));
  };

  const toggleVisibleTasks = () => {
    const visibleTaskIds = [...activeTasks, ...archivedTasks].map((task) => task.id);
    setSelectedIds((current) =>
      visibleTaskIds.length > 0 && visibleTaskIds.every((id) => current.includes(id)) ? [] : visibleTaskIds
    );
  };

  const deleteTasks = async (all = false) => {
    const ids = selectedIds;

    if (!all && ids.length === 0) {
      toast.warn('请选择要删除的清洁任务');
      return;
    }

    const confirmed = await confirm({
      title: all ? '删除全部清洁任务' : '删除所选清洁任务',
      message: all
        ? '任务下的前后验证记录也会同步删除，删除后无法恢复。'
        : `将删除已选择的 ${ids.length} 个清洁任务，相关验证记录也会同步删除。`,
      confirmText: '删除',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    setDeletingTasks(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as TasksResponse;

      if (!data.success) {
        throw new Error(data.message || '删除清洁任务失败');
      }

      if (verificationTask && (all || ids.includes(verificationTask.id))) {
        closeVerificationModal();
      }

      setSelectedIds([]);
      setSelectionMode(false);
      toast.success('清洁任务已删除', `已删除 ${data.deletedCount ?? 0} 个任务`);
      await loadTasks();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除清洁任务失败';
      setError(message);
      toast.error('删除清洁任务失败', message);
    } finally {
      setDeletingTasks(false);
    }
  };

  const openVerificationModal = (task: CleaningTask) => {
    setVerificationTask(task);
    setVerificationPreview(null);
    setVerificationError(null);
    setVerificationResult(task.latestVerification ?? null);
    setVerificationAnalysis(
      task.latestVerification
        ? {
            score: task.latestVerification.afterScore,
            event: task.latestVerification.afterSummary,
            action: task.latestVerification.afterAction,
            suggestions: task.latestVerification.afterSuggestions,
          }
        : null
    );
  };

  const handleVerificationImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setVerificationPreview(reader.result as string);
      setVerificationError(null);
      setVerificationResult(null);
      setVerificationAnalysis(null);
    };
    reader.readAsDataURL(file);
  };

  const submitVerification = async () => {
    if (!verificationTask) {
      return;
    }

    if (!verificationPreview) {
      setVerificationError('请先上传整理后的桌面照片');
      toast.warn('缺少整理后照片', '请先上传一张整理后的桌面照片');
      return;
    }

    setVerificationSubmitting(true);
    setVerificationError(null);

    try {
      const response = await fetch(`/api/tasks/${verificationTask.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ image: verificationPreview }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as TaskVerificationResponse;

      if (!data.success || !data.task || !data.verification || !data.result) {
        throw new Error(data.message || '前后对比验证失败');
      }

      syncTask(data.task);
      setVerificationTask(data.task);
      setVerificationResult(data.verification);
      setVerificationAnalysis(data.result);
      toast.success('前后对比已完成', `整理后评分 ${data.verification.afterScore}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '前后对比验证失败';
      setVerificationError(message);
      toast.error('前后对比失败', message);
    } finally {
      setVerificationSubmitting(false);
    }
  };

  const renderSuggestionList = (suggestions: Suggestion[], taskId: string) => {
    if (suggestions.length === 0) {
      return null;
    }

    return (
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          <Sparkles size={13} />
          Garden 建议
        </div>
        <div className="space-y-2">
          {suggestions.slice(0, 2).map((suggestion, index) => (
            <div key={`${taskId}-${index}`} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <span className="font-bold text-slate-700 dark:text-slate-200">{suggestion.label}：</span>
              {suggestion.desc}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderVerificationSummary = (task: CleaningTask) => {
    if (!task.latestVerification) {
      return null;
    }

    const deltaMeta = getDeltaMeta(task.latestVerification.scoreDelta);

    return (
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 dark:bg-emerald-900/10 dark:border-emerald-900/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">最近验证</p>
            <p className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">
              已完成 {task.verificationCount ?? 0} 次前后对比
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold ${deltaMeta.className}`}>
            {deltaMeta.icon}
            {deltaMeta.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">整理前</div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {task.latestVerification.beforeScore ?? '--'}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">整理后</div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {task.latestVerification.afterScore}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">变化值</div>
            <div className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {formatDeltaValue(task.latestVerification.scoreDelta)}
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">
          {task.latestVerification.afterSummary}
        </p>
      </section>
    );
  };

  const renderTaskCard = (task: CleaningTask) => {
    const isUpdating = updatingTaskId === task.id;
    const verifyDisabled = !canVerifyTask(task);
    const isSelected = selectedIds.includes(task.id);

    return (
      <article
        key={task.id}
        className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
      >
        {task.imageUrl ? <img src={task.imageUrl} alt="任务来源画面" className="w-full h-40 object-cover" /> : null}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            {selectionMode ? (
              <button
                type="button"
                onClick={() => toggleSelected(task.id)}
                className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 text-transparent dark:border-slate-700'
                }`}
                aria-label="选择清洁任务"
              >
                ✓
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${priorityMeta[task.priority].className}`}>
                  {priorityMeta[task.priority].label}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusMeta[task.status].className}`}>
                  {statusMeta[task.status].icon}
                  {statusMeta[task.status].label}
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 break-words">{task.title}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed break-words">{task.description}</p>
            </div>
            {task.score !== null && task.score !== undefined ? (
              <div className="shrink-0 w-14 h-14 rounded-2xl bg-slate-950 text-white flex flex-col items-center justify-center">
                <span className="text-[9px] uppercase tracking-widest text-slate-400">评分</span>
                <span className="text-lg font-black">{task.score}</span>
              </div>
            ) : null}
          </div>

          {renderSuggestionList(task.suggestions, task.id)}
          {renderVerificationSummary(task)}

          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <span>{sourceLabel[task.sourceType]}</span>
            <span>{formatDateTime(task.createdAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {task.status === 'pending' ? (
              <button
                type="button"
                onClick={() => void updateTaskStatus(task.id, 'running')}
                disabled={isUpdating}
                className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white py-3 text-sm font-bold disabled:opacity-50"
              >
                {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                开始执行
              </button>
            ) : null}
            {task.status === 'running' ? (
              <button
                type="button"
                onClick={() => void updateTaskStatus(task.id, 'pending')}
                disabled={isUpdating}
                className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 text-slate-600 py-3 text-sm font-bold disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                暂停执行
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => openVerificationModal(task)}
              disabled={isUpdating || verifyDisabled}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-white py-3 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ScanSearch size={16} />
              整理后验证
            </button>

            {task.status !== 'completed' ? (
              <button
                type="button"
                onClick={() => void updateTaskStatus(task.id, task.status === 'ignored' ? 'pending' : 'ignored')}
                disabled={isUpdating}
                className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 text-slate-600 py-3 text-sm font-bold disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                {task.status === 'ignored' ? '恢复任务' : '暂不处理'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void updateTaskStatus(task.id, 'pending')}
                disabled={isUpdating}
                className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 text-slate-600 py-3 text-sm font-bold disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                重新打开
              </button>
            )}

            <button
              type="button"
              onClick={() => void deleteTask(task.id)}
              disabled={isUpdating}
              className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-red-50 text-red-600 py-3 text-sm font-bold disabled:opacity-50 dark:bg-red-900/20 dark:text-red-200"
            >
              <Trash2 size={16} />
              删除任务
            </button>
          </div>

          {verifyDisabled ? (
            <p className="text-[11px] leading-relaxed text-slate-400">
              该任务缺少“整理前”的分数或图片基线，暂时不能进行前后对比验证。
            </p>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white p-5 overflow-hidden relative">
        <div className="absolute -right-16 -top-16 w-44 h-44 rounded-full bg-blue-500/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-blue-200">
              <Bot size={15} />
              任务编排
            </div>
            <h2 className="mt-3 text-2xl font-black">清洁任务中心</h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              将图片分析和实时监控中的 Garden 建议转化为可跟踪任务，并在整理完成后用新照片做前后对比验证。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="shrink-0 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-xs font-bold"
          >
            刷新
          </button>
        </div>
      </section>

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-red-100 bg-red-50 text-red-700 p-4 text-sm leading-relaxed dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40">
          <span>{error}</span>
          <button type="button" onClick={() => void loadTasks()} className="shrink-0 font-black">
            重试
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">待处理</div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{pendingCount}</div>
        </div>
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">执行中</div>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-300">{runningCount}</div>
        </div>
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">已验证</div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-300">{verifiedTasks.length}</div>
        </div>
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">平均改善</div>
          <div className="mt-2 text-2xl font-black text-violet-600 dark:text-violet-300">
            {averageDelta === null ? '--' : `${averageDelta > 0 ? '+' : ''}${averageDelta}`}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/40 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">闭环进度</div>
          <p className="mt-2 text-sm font-black text-emerald-900 dark:text-emerald-100">
            已有 {improvedTasks} 个任务通过整理后验证，形成“发现问题 → 执行清理 → 再次验证”的闭环。
          </p>
        </div>
        <div className="rounded-3xl border border-blue-100 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-500">验证说明</div>
          <p className="mt-2 text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
            自动生成的分析任务和监控任务会继承“整理前”桌面图片与分数。整理完成后上传新照片，系统会重新调用 Garden 生成对比报告。
          </p>
        </div>
      </section>

      <RecordDeleteBar
        totalCount={activeTasks.length + archivedTasks.length}
        selectedCount={selectedIds.length}
        selectionMode={selectionMode}
        disabled={loading || deletingTasks}
        onToggleMode={toggleSelectionMode}
        onToggleAll={toggleVisibleTasks}
        onDeleteSelected={() => void deleteTasks(false)}
        onDeleteAll={() => void deleteTasks(true)}
      />

      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ScanSearch size={18} className="text-blue-500" />
          <h3 className="font-black text-slate-900 dark:text-slate-100">任务筛选与排序</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={17} />
          <input
            value={taskKeyword}
            onChange={(event) => setTaskKeyword(event.target.value)}
            placeholder="搜索任务标题或说明"
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 dark:text-slate-100 outline-none"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as CleaningTaskStatus | 'active' | 'all')}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-100 outline-none"
          >
            <option value="active">当前任务</option>
            <option value="all">全部任务</option>
            <option value="pending">待处理</option>
            <option value="running">执行中</option>
            <option value="completed">已完成</option>
            <option value="ignored">已忽略</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as CleaningTaskPriority | 'all')}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-100 outline-none"
          >
            <option value="all">全部优先级</option>
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as 'newest' | 'oldest' | 'priority')}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-100 outline-none"
          >
            <option value="priority">优先级优先</option>
            <option value="newest">最新创建优先</option>
            <option value="oldest">最早创建优先</option>
          </select>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          当前筛选命中 {filteredTasks.length} 个任务，其中 {activeTasks.length} 个仍在队列中。
        </p>
      </section>

      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Plus size={18} className="text-blue-500" />
          <h3 className="font-black text-slate-900 dark:text-slate-100">手动补充任务</h3>
        </div>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：整理显示器右侧水杯和药盒"
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm outline-none text-slate-900 dark:text-slate-100"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="填写任务说明、目标区域或完成标准"
            rows={3}
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm outline-none resize-none text-slate-900 dark:text-slate-100"
          />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3">
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as CleaningTaskPriority)}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm outline-none text-slate-900 dark:text-slate-100"
            >
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <button
              type="button"
              onClick={() => void createManualTask()}
              disabled={submitting}
              className="rounded-2xl bg-blue-600 text-white px-6 py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              创建任务
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ListChecks size={18} className="text-blue-500" />
            当前任务队列
          </h3>
          {loading ? <Loader2 size={18} className="animate-spin text-blue-500" /> : null}
        </div>

        {activeTasks.length > 0 ? (
          <div className="space-y-4">{activeTasks.map(renderTaskCard)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
            <CircleDot className="mx-auto text-slate-300 dark:text-slate-600" size={34} />
            <h4 className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">暂无待处理任务</h4>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              当图片分析或实时监控发现桌面整洁度偏低时，系统会自动在这里生成清洁任务。
            </p>
          </div>
        )}
      </section>

      {archivedTasks.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 px-1">
            <CheckCircle2 size={18} className="text-emerald-500" />
            最近归档
          </h3>
          <div className="space-y-3">
            {archivedTasks.map((task) => {
              const deltaMeta = getDeltaMeta(task.latestVerification?.scoreDelta);
              const isSelected = selectedIds.includes(task.id);

              return (
                <div
                  key={task.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    {selectionMode ? (
                      <button
                        type="button"
                        onClick={() => toggleSelected(task.id)}
                        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 text-transparent dark:border-slate-700'
                        }`}
                        aria-label="选择归档任务"
                      >
                        ✓
                      </button>
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words">{task.title}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {sourceLabel[task.sourceType]}
                        {task.latestVerification ? ` · ${formatDateTime(task.latestVerification.createdAt)}` : ''}
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusMeta[task.status].className}`}>
                      {statusMeta[task.status].icon}
                      {statusMeta[task.status].label}
                    </span>
                  </div>

                  {task.latestVerification ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${deltaMeta.className}`}>
                        {deltaMeta.icon}
                        {deltaMeta.label}
                      </span>
                      <span className="text-[11px] text-slate-400">整理后评分 {task.latestVerification.afterScore}</span>
                    </div>
                  ) : null}

                  {canVerifyTask(task) ? (
                    <button
                      type="button"
                      onClick={() => openVerificationModal(task)}
                      className="w-full rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 py-3 text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <ScanSearch size={16} />
                      查看 / 再次验证
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-amber-100 bg-amber-50 text-amber-800 p-4 text-sm leading-relaxed dark:bg-amber-900/20 dark:text-amber-100 dark:border-amber-900/40 flex gap-3">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <p>
          当前版本暂不直接控制真实机器人硬件。这里先完成任务编排、执行状态和前后验证闭环，后续接入机器人后可以把“开始执行”替换为真实设备指令接口。
        </p>
      </section>

      {verificationTask ? (
        <div className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="mx-auto max-w-3xl h-full max-h-[92vh] overflow-hidden rounded-[2rem] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-500">前后对比验证</div>
                <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">{verificationTask.title}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  上传整理后的新照片，系统会重新分析并生成改善结果。
                </p>
              </div>
              <button
                type="button"
                onClick={closeVerificationModal}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {verificationError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 p-4 text-sm leading-relaxed dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40">
                  {verificationError}
                </div>
              ) : null}

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">整理前基线</p>
                      <p className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">
                        基线评分 {verificationTask.score ?? '--'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${priorityMeta[verificationTask.priority].className}`}>
                      {priorityMeta[verificationTask.priority].label}
                    </span>
                  </div>

                  {verificationTask.imageUrl ? (
                    <img
                      src={verificationTask.imageUrl}
                      alt="整理前桌面"
                      className="mt-4 h-48 w-full rounded-2xl object-cover border border-slate-200 dark:border-slate-800"
                    />
                  ) : (
                    <div className="mt-4 h-48 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm text-slate-400">
                      当前任务缺少整理前图片
                    </div>
                  )}

                  <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {verificationTask.description}
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">整理后上传</p>
                      <p className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">
                        选择一张整理后的新桌面照片
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => verificationInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 text-white px-4 py-2 text-xs font-bold"
                    >
                      <ImagePlus size={14} />
                      选择图片
                    </button>
                  </div>

                  {verificationPreview ? (
                    <img
                      src={verificationPreview}
                      alt="整理后桌面"
                      className="mt-4 h-48 w-full rounded-2xl object-cover border border-slate-200 dark:border-slate-800"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => verificationInputRef.current?.click()}
                      className="mt-4 h-48 w-full rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-slate-500 transition-colors"
                    >
                      <Upload size={24} />
                      <span className="text-sm font-medium">点击上传整理后的照片</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void submitVerification()}
                    disabled={verificationSubmitting}
                    className="mt-4 w-full rounded-2xl bg-emerald-600 text-white py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {verificationSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />}
                    生成前后对比报告
                  </button>
                </div>
              </section>

              {verificationResult && verificationAnalysis ? (
                <section className="rounded-3xl border border-emerald-100 bg-emerald-50/70 dark:bg-emerald-900/10 dark:border-emerald-900/30 p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-500">改善报告</div>
                      <h4 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">整理结果已验证</h4>
                      <p className="mt-2 text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">
                        {verificationResult.afterSummary}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold ${getDeltaMeta(verificationResult.scoreDelta).className}`}>
                      {getDeltaMeta(verificationResult.scoreDelta).icon}
                      {getDeltaMeta(verificationResult.scoreDelta).label}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">整理前</div>
                      <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                        {verificationResult.beforeScore ?? '--'}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">整理后</div>
                      <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                        {verificationResult.afterScore}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">变化值</div>
                      <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">
                        {formatDeltaValue(verificationResult.scoreDelta)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">整理前概述</div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {verificationResult.beforeSummary || '本任务未记录整理前概述。'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">整理后建议</div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {verificationAnalysis.action}
                      </p>
                    </div>
                  </div>

                  {verificationAnalysis.suggestions.length > 0 ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">整理后优化建议</div>
                      <div className="space-y-3">
                        {verificationAnalysis.suggestions.slice(0, 3).map((item, index) => (
                          <div key={`${item.label}-${index}`} className="rounded-2xl bg-slate-50 dark:bg-slate-900 p-3">
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.label}</div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeVerificationModal}
                className="rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 px-5 py-3 text-sm font-bold"
              >
                关闭
              </button>
              {verificationResult ? (
                <button
                  type="button"
                  onClick={() => {
                    setVerificationPreview(null);
                    setVerificationResult(null);
                    setVerificationAnalysis(null);
                    setVerificationError(null);
                  }}
                  className="rounded-2xl bg-emerald-600 text-white px-5 py-3 text-sm font-bold"
                >
                  再次上传验证
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={verificationInputRef}
        type="file"
        accept="image/*"
        onChange={handleVerificationImageChange}
        className="hidden"
      />
    </div>
  );
};

export default RobotView;
