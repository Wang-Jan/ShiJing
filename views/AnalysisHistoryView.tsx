import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AnalysisRecord, AnalysisRecordStats } from '../types';
import { useToast } from '../src/toast';
import RecordDeleteBar from '../src/RecordDeleteBar';
import { useConfirm } from '../src/confirm';

interface AnalysisHistoryViewProps {
  authToken: string;
}

interface AnalysisRecordsResponse {
  success: boolean;
  message?: string;
  records?: AnalysisRecord[];
  stats?: AnalysisRecordStats;
  deletedCount?: number;
}

const emptyStats: AnalysisRecordStats = {
  totalCount: 0,
  averageScore: null,
  bestScore: null,
  needsAttentionCount: 0,
  taskLinkedCount: 0,
};

const readErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message || '请求失败';
};

const getScoreTone = (score: number) => {
  if (score >= 80) {
    return {
      label: '良好',
      className: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40',
      bar: 'bg-emerald-400',
    };
  }

  if (score >= 60) {
    return {
      label: '需整理',
      className: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40',
      bar: 'bg-amber-400',
    };
  }

  return {
    label: '高风险',
    className: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40',
    bar: 'bg-red-400',
  };
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="text-blue-500">{icon}</div>
    </div>
    <div className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">{value}</div>
    <p className="mt-2 text-xs text-slate-400 leading-relaxed">{hint}</p>
  </div>
);

const AnalysisHistoryView: React.FC<AnalysisHistoryViewProps> = ({ authToken }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [stats, setStats] = useState<AnalysisRecordStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRecord = records[0] ?? null;
  const trendRecords = records.slice(0, 12).reverse();

  const loadRecords = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analysis/records?limit=50', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as AnalysisRecordsResponse;

      if (!data.success) {
        throw new Error(data.message || '读取分析历史失败');
      }

      setRecords(data.records ?? []);
      setStats(data.stats ?? emptyStats);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '读取分析历史失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    const availableIds = new Set(records.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [records]);

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds([]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleAllRecords = () => {
    const recordIds = records.map((item) => item.id);
    setSelectedIds((current) =>
      recordIds.length > 0 && recordIds.every((id) => current.includes(id)) ? [] : recordIds
    );
  };

  const deleteRecords = async (all = false) => {
    const ids = selectedIds;

    if (!all && ids.length === 0) {
      toast.warn('请选择要删除的分析记录');
      return;
    }

    const confirmed = await confirm({
      title: all ? '删除全部分析历史' : '删除所选分析记录',
      message: all ? '全部分析历史删除后无法恢复。' : `将删除已选择的 ${ids.length} 条分析记录，删除后无法恢复。`,
      confirmText: '删除',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/analysis/records', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });

      const data = (await response.json().catch(() => null)) as AnalysisRecordsResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || '删除分析历史失败');
      }

      setSelectedIds([]);
      setSelectionMode(false);
      toast.success('分析历史已删除', `已删除 ${data.deletedCount ?? 0} 条记录`);
      await loadRecords();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除分析历史失败';
      setError(message);
      toast.error('删除分析历史失败', message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 pb-24 space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-5 overflow-hidden relative">
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-blue-500/20 blur-2xl" />
        <div className="relative">
          <Link to="/ai" className="inline-flex items-center gap-2 text-xs text-slate-300 font-bold mb-5">
            <ArrowLeft size={14} />
            返回智能分析
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-blue-200">
                <History size={15} />
                分析档案
              </div>
              <h2 className="mt-3 text-2xl font-black">分析历史档案</h2>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                记录每次上传图片后的 Garden 诊断结果，沉淀评分趋势、问题摘要、历史快照和任务关联。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRecords()}
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

      <section className="grid grid-cols-2 gap-4">
        <StatCard
          label="分析次数"
          value={stats.totalCount}
          hint="已持久化保存的单图诊断记录"
          icon={<FileText size={18} />}
        />
        <StatCard
          label="平均评分"
          value={stats.averageScore !== null ? stats.averageScore.toFixed(1) : '--'}
          hint="反映历史桌面整洁度水平"
          icon={<BarChart3 size={18} />}
        />
        <StatCard
          label="最佳评分"
          value={stats.bestScore ?? '--'}
          hint="历史上传图片中的最高整洁度"
          icon={<ShieldCheck size={18} />}
        />
        <StatCard
          label="任务转化"
          value={stats.taskLinkedCount}
          hint={`有 ${stats.needsAttentionCount} 次分析需要重点整理`}
          icon={<ClipboardList size={18} />}
        />
      </section>

      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-500" />
              单图评分趋势
            </h3>
            <p className="text-xs text-slate-400 mt-1">展示最近 12 次上传分析的整洁度变化</p>
          </div>
          {loading ? <Loader2 size={18} className="animate-spin text-blue-500" /> : null}
        </div>

        {trendRecords.length > 0 ? (
          <div className="h-44 flex items-end gap-2">
            {trendRecords.map((record) => {
              const tone = getScoreTone(record.score);

              return (
                <div key={record.id} className="flex-1 min-w-[18px] flex flex-col items-center justify-end gap-2">
                  <div
                    className={`w-full rounded-t-2xl ${tone.bar}`}
                    style={{ height: `${Math.max(12, record.score)}%` }}
                    title={`${record.score} 分`}
                  />
                  <span className="text-[10px] text-slate-400">{record.score}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
            暂无可绘制的分析趋势。完成一次图片分析后，这里会生成评分曲线。
          </div>
        )}
      </section>

      {latestRecord ? (
        <section className="rounded-3xl bg-slate-950 text-white overflow-hidden shadow-sm">
          {latestRecord.imageUrl ? <img src={latestRecord.imageUrl} alt="最近分析图片" className="w-full h-48 object-cover opacity-85" /> : null}
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400 font-bold">最新报告</div>
                <h3 className="mt-2 text-xl font-black">最近一次桌面诊断</h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">{latestRecord.event}</p>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-white text-slate-950 flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] uppercase tracking-widest text-slate-400">评分</span>
                <span className="text-xl font-black">{latestRecord.score}</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">{latestRecord.action}</p>
          </div>
        </section>
      ) : null}

      <RecordDeleteBar
        totalCount={records.length}
        selectedCount={selectedIds.length}
        selectionMode={selectionMode}
        disabled={loading || deleting}
        onToggleMode={toggleSelectionMode}
        onToggleAll={toggleAllRecords}
        onDeleteSelected={() => void deleteRecords(false)}
        onDeleteAll={() => void deleteRecords(true)}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles size={18} className="text-blue-500" />
            历史报告列表
          </h3>
          <span className="text-xs text-slate-400">最近 {records.length} 条</span>
        </div>

        {records.length > 0 ? (
          <div className="space-y-3">
            {records.map((record) => {
              const tone = getScoreTone(record.score);

              return (
                <article
                  key={record.id}
                  className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  <div className="flex gap-4 p-4">
                    {selectionMode ? (
                      <button
                        type="button"
                        onClick={() => toggleSelected(record.id)}
                        className={`mt-9 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                          selectedIds.includes(record.id)
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 text-transparent dark:border-slate-700'
                        }`}
                        aria-label="选择分析记录"
                      >
                        ✓
                      </button>
                    ) : null}
                    <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center">
                      {record.imageUrl ? (
                        <img src={record.imageUrl} alt="分析图片" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={24} className="text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${tone.className}`}>
                          {record.score} 分 · {tone.label}
                        </span>
                        {record.taskId ? (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600 text-[10px] font-bold dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-900/40">
                            <CheckCircle2 size={12} />
                            已转任务
                          </span>
                        ) : null}
                      </div>
                      <h4 className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100 break-words">{record.event}</h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{record.action}</p>
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                        {record.score < 78 ? <AlertTriangle size={12} className="text-amber-500" /> : <ShieldCheck size={12} className="text-emerald-500" />}
                        {new Date(record.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
            <FileText className="mx-auto text-slate-300 dark:text-slate-600" size={34} />
            <h4 className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">暂无分析历史</h4>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">进入智能分析页上传一张桌面图片后，系统会自动保存报告。</p>
            <Link
              to="/ai"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 text-white px-4 py-2 text-xs font-black"
            >
              去分析图片
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};

export default AnalysisHistoryView;
