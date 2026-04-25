import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock3,
  ClipboardList,
  FileText,
  History,
  Lightbulb,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { AnalysisRecord, CleaningTask, Insight, Suggestion } from '../types';
import { useToast } from '../src/toast';
import { isLikelyNetworkError } from '../src/apiClient';

interface AIViewProps {
  authToken: string;
  autoCreateTaskEnabled: boolean;
  setInsights: React.Dispatch<React.SetStateAction<Insight[]>>;
}

interface AnalysisResult {
  score: number;
  event: string;
  action: string;
  suggestions: Suggestion[];
}

interface AnalyzeResponse {
  success: boolean;
  message?: string;
  code?: string;
  details?: string;
  result?: AnalysisResult;
  task?: CleaningTask | null;
  record?: AnalysisRecord | null;
}

const getScoreTone = (score: number) => {
  if (score >= 85) {
    return {
      label: '优秀',
      chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
      ring: 'from-emerald-500 to-teal-400',
      summary: '当前桌面状态优秀，可继续保持。',
    };
  }

  if (score >= 70) {
    return {
      label: '良好',
      chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
      ring: 'from-blue-500 to-cyan-400',
      summary: '桌面整体可控，建议处理少量可见杂物。',
    };
  }

  return {
    label: '待优化',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    ring: 'from-amber-500 to-orange-400',
    summary: '桌面整洁度偏低，系统已优先整理可执行建议。',
  };
};

const AIView: React.FC<AIViewProps> = ({
  authToken,
  autoCreateTaskEnabled,
  setInsights,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [taskCreated, setTaskCreated] = useState<CleaningTask | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readErrorMessage = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await response.json().catch(() => null)) as AnalyzeResponse | null;
      return payload?.message || '分析失败';
    }

    const text = await response.text().catch(() => '');
    return text.trim() || '分析失败';
  };

  const resetResult = () => {
    setShowResult(false);
    setAnalysisResult(null);
    setTaskCreated(null);
    setErrorMessage(null);
  };

  const startAnalysis = async () => {
    if (!selectedImage) {
      setErrorMessage('请先上传或拍摄一张桌面图片');
      toast.warn('还没有图片', '请先上传或拍摄一张桌面图片');
      return;
    }

    if (!navigator.onLine) {
      const message = '当前设备未联网。图片可以继续预览，但 Garden 分析需要连接后端服务后才能执行。';
      setErrorMessage(message);
      toast.warn('当前处于离线模式', message);
      return;
    }

    setLoading(true);
    setShowResult(false);
    setTaskCreated(null);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ image: selectedImage }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as AnalyzeResponse;

      if (!data.success || !data.result) {
        throw new Error(data.message || '分析失败');
      }

      setAnalysisResult(data.result);
      setTaskCreated(data.task ?? null);

      const newInsight: Insight = {
        id: Date.now().toString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: data.result.score > 80 ? 'success' : data.result.score > 60 ? 'info' : 'warn',
        event: data.result.event,
        action: data.result.action,
        score: data.result.score,
        imageUrl: selectedImage,
        suggestions: data.result.suggestions,
      };

      setInsights((prev) => [newInsight, ...prev]);
      setShowResult(true);
      toast.success('桌面诊断已完成', data.task ? '已同步生成清洁任务' : '分析结果已保存到历史档案');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '分析失败';
      const message =
        isLikelyNetworkError(error)
          ? '无法连接到分析服务。请检查网络、后端服务以及 Garden 服务配置是否可用。'
          : rawMessage;

      console.error('Analysis failed:', error);
      setErrorMessage(message);
      toast.error('桌面分析失败', message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      resetResult();
    };
    reader.readAsDataURL(file);
  };

  const scoreTone = analysisResult ? getScoreTone(analysisResult.score) : null;

  return (
    <div className="p-4 space-y-6 pb-24">
      <section className="rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-900/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
              <Sparkles size={13} />
              Garden AI Diagnostics
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">桌面智能分析</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              上传或拍摄桌面图片，Garden 会生成整洁度评分、问题总结、清洁建议，并在必要时自动创建任务。
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              to="/analysis-history"
              className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-400 border border-slate-200 dark:border-slate-800"
              aria-label="查看分析历史"
            >
              <History size={20} />
            </Link>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 text-red-700 p-4 text-sm leading-relaxed dark:bg-red-900/20 dark:text-red-200 dark:border-red-900/40 flex gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {!selectedImage ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="aspect-square w-full border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center bg-white dark:bg-slate-900/50 active:scale-[0.98] transition-all group"
        >
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Upload className="text-blue-600 dark:text-blue-400" size={32} />
          </div>
          <span className="text-slate-800 dark:text-slate-200 font-black">上传或拍摄桌面图片</span>
          <p className="text-slate-400 text-xs mt-2 text-center px-10 leading-relaxed">
            支持手机相册、电脑图片或移动端直接拍摄，分析完成后会生成正式报告。
          </p>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-[2.5rem] overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl aspect-square bg-slate-200">
            <img src={selectedImage} alt="桌面预览" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => {
                setSelectedImage(null);
                resetResult();
              }}
              className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md text-white rounded-full hover:bg-black/70 transition-colors"
              aria-label="移除当前图片"
            >
              <X size={20} />
            </button>

            {loading ? (
              <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] flex flex-col items-center justify-center">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  <Brain className="absolute inset-0 m-auto text-white animate-pulse" size={32} />
                </div>
                <p className="text-white font-bold mt-4 text-sm tracking-widest">GARDEN 正在生成分析报告...</p>
              </div>
            ) : null}
          </div>

          {!loading && !showResult ? (
            <button
              type="button"
              onClick={startAnalysis}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-blue-200 dark:shadow-none"
            >
              <Sparkles size={24} />
              开始生成报告
            </button>
          ) : null}
        </div>
      )}

      {showResult && analysisResult && scoreTone ? (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-5">
          <section className="rounded-[2rem] overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-300">
                    <FileText size={14} />
                    Garden 诊断
                  </div>
                  <h3 className="mt-3 text-2xl font-black">桌面诊断报告</h3>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed">{scoreTone.summary}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-black ${scoreTone.chip}`}>{scoreTone.label}</div>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 gap-4 items-start sm:grid-cols-[110px,1fr] sm:items-center">
              <div className={`aspect-square w-[110px] rounded-[1.75rem] bg-gradient-to-br ${scoreTone.ring} p-[1px] mx-auto sm:mx-0`}>
                <div className="w-full h-full rounded-[1.7rem] bg-white dark:bg-slate-950 flex flex-col items-center justify-center">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-slate-400">评分</span>
                  <span className="text-4xl font-black text-slate-900 dark:text-slate-100 italic">{analysisResult.score}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    <Clock3 size={14} />
                    生成时间
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">{new Date().toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    <ShieldCheck size={14} />
                    模型
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">Garden Vision</p>
                </div>
              </div>
            </div>
          </section>

          {taskCreated ? (
            <section className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/40 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <ClipboardList size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-emerald-900 dark:text-emerald-100">已自动生成清洁任务</h3>
                  <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
                    {taskCreated.title}。你可以进入任务中心继续模拟执行、标记完成或调整状态。
                  </p>
                  <Link
                    to="/robot"
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 text-white px-4 py-2 text-xs font-black"
                  >
                    查看任务中心 <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-[1.75rem] border border-blue-100 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40 p-4 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-blue-600 dark:text-blue-300 mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
                {autoCreateTaskEnabled
                  ? '本次桌面状态未达到自动生成清洁任务的阈值，可继续保持或根据建议手动创建任务。'
                  : '你已在设置中关闭自动生成清洁任务。本次分析已归档，可根据建议到任务中心手动创建任务。'}
              </p>
            </section>
          )}

          <section className="rounded-[1.75rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">本次分析已保存到历史档案</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">后续可以在分析历史中查看评分趋势、历史图片和任务关联情况。</p>
            </div>
            <Link
              to="/analysis-history"
              className="shrink-0 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-black"
            >
              查看
            </Link>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <ScanSearch size={18} className="text-blue-600" />
                <span className="text-sm font-black text-blue-900 dark:text-blue-100">核心发现</span>
              </div>
              <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">{analysisResult.event}</p>
            </div>
            <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={18} className="text-amber-600" />
                <span className="text-sm font-black text-amber-900 dark:text-amber-100">建议动作</span>
              </div>
              <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">{analysisResult.action}</p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb size={18} className="text-yellow-500" />
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">优化建议清单</h3>
            </div>
            <div className="space-y-3">
              {analysisResult.suggestions.map((item, index) => (
                <div key={`${item.label}-${index}`} className="rounded-[1.5rem] border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-sm font-black shrink-0">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">{item.label}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                    <div className="self-start max-w-full break-words px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 text-[11px] font-black sm:max-w-[180px]">
                      {item.impact}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              setSelectedImage(null);
              resetResult();
            }}
            className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-4 rounded-3xl font-bold flex items-center justify-center gap-2"
          >
            重新分析
            <ArrowRight size={18} />
          </button>
        </div>
      ) : null}

      <div className="text-center px-6">
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
          当前分析由后端转发到 Garden 模型服务完成，统一使用项目环境变量中的默认配置。
        </p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
    </div>
  );
};

export default AIView;
