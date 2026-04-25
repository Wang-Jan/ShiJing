import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Clock3,
  Download,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Webcam,
} from 'lucide-react';
import { MonitorEvent, MonitorFrameAnalysis, MonitorSessionSummary } from '../types';
import { useToast } from '../src/toast';
import { isLikelyNetworkError } from '../src/apiClient';

interface LiveViewProps {
  authToken: string;
  monitorSession: MonitorSessionSummary | null;
  monitorEvents: MonitorEvent[];
  defaultCaptureIntervalSeconds: number;
  onMonitorSessionChange: React.Dispatch<React.SetStateAction<MonitorSessionSummary | null>>;
  onMonitorEventsChange: React.Dispatch<React.SetStateAction<MonitorEvent[]>>;
  onMonitorFrame: (payload: MonitorFrameAnalysis) => void;
}

interface MonitorStartResponse {
  success: boolean;
  message?: string;
  session?: MonitorSessionSummary;
}

interface MonitorFrameResponse {
  success: boolean;
  message?: string;
  code?: string;
  details?: string;
  data?: MonitorFrameAnalysis;
}

const LiveView: React.FC<LiveViewProps> = ({
  authToken,
  monitorSession,
  monitorEvents,
  defaultCaptureIntervalSeconds,
  onMonitorSessionChange,
  onMonitorEventsChange,
  onMonitorFrame,
}) => {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureLockRef = useRef(false);
  const runningRef = useRef(false);
  const sessionIdRef = useRef<string | null>(monitorSession?.sessionId ?? null);
  const [permissionState, setPermissionState] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [captureIntervalSeconds, setCaptureIntervalSeconds] = useState<number>(
    monitorSession?.captureIntervalSeconds ?? defaultCaptureIntervalSeconds
  );
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSubmittingFrame, setIsSubmittingFrame] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastCaptureAt, setLastCaptureAt] = useState<string | null>(null);
  const [manualSnapshot, setManualSnapshot] = useState<string | null>(null);

  const latestEvent = monitorEvents[0] ?? null;
  const latestScore = monitorSession?.latestScore ?? null;
  const averageScore = monitorSession?.averageScore ?? null;

  const scoreHistory = monitorEvents.slice(0, 8).reverse();

  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    sessionIdRef.current = monitorSession?.sessionId ?? null;
  }, [monitorSession?.sessionId]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const enumerateCameras = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameras([]);
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === 'videoinput');
    setCameras(videoInputs);

    if (!selectedCameraId && videoInputs.length > 0) {
      setSelectedCameraId(videoInputs[0].deviceId);
    }
  };

  const attachStream = async (stream: MediaStream) => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream;
    await videoRef.current.play();
  };

  const startPreview = async (cameraId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState('denied');
      const secureHint = window.isSecureContext ? '' : '当前 WebView 不是安全上下文，请安装同步后的新版 APK。';
      throw new Error(`当前 WebView 暂不支持实时摄像头预览。${secureHint}可使用“手机拍照”继续提交监控画面。`);
    }

    setIsCameraLoading(true);
    setLiveError(null);

    try {
      stopStream();

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: cameraId
          ? {
              deviceId: { exact: cameraId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'environment',
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setManualSnapshot(null);
      setPermissionState('granted');
      await attachStream(stream);
      await enumerateCameras();
    } catch (error) {
      setPermissionState('denied');
      throw error;
    } finally {
      setIsCameraLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await startPreview();
      } catch (error) {
        const message = error instanceof Error ? error.message : '摄像头初始化失败';
        setLiveError(message);
      }
    };

    void init();

    return () => {
      const currentSessionId = sessionIdRef.current;

      if (runningRef.current && currentSessionId) {
        void fetch('/api/monitor/session/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ sessionId: currentSessionId }),
          keepalive: true,
        }).catch(() => undefined);

        onMonitorSessionChange((current) =>
          current && current.sessionId === currentSessionId
            ? {
                ...current,
                status: 'stopped',
                endedAt: new Date().toISOString(),
              }
            : current
        );
      }

      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!monitorSession) {
      return;
    }

    setCaptureIntervalSeconds(monitorSession.captureIntervalSeconds);
  }, [monitorSession]);

  useEffect(() => {
    if (monitorSession || isRunning) {
      return;
    }

    setCaptureIntervalSeconds(defaultCaptureIntervalSeconds);
  }, [defaultCaptureIntervalSeconds, isRunning, monitorSession]);

  const readErrorMessage = async (response: Response) => {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return payload?.message || '请求失败';
  };

  const getSelectedCameraLabel = () => {
    if (manualSnapshot) {
      return '手机拍照画面';
    }

    return cameras.find((item) => item.deviceId === selectedCameraId)?.label || '默认摄像头';
  };

  const captureCurrentFrame = () => {
    if (manualSnapshot) {
      return manualSnapshot;
    }

    if (!videoRef.current || !canvasRef.current) {
      return null;
    }

    const video = videoRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = canvasRef.current;
    const targetWidth = Math.min(video.videoWidth, 1280);
    const ratio = targetWidth / video.videoWidth;
    const targetHeight = Math.max(1, Math.round(video.videoHeight * ratio));

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const handleMobileCaptureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      const snapshot = typeof reader.result === 'string' ? reader.result : '';

      if (!snapshot) {
        setLiveError('读取手机拍照画面失败，请重新拍摄。');
        return;
      }

      stopStream();
      setManualSnapshot(snapshot);
      setPermissionState('granted');
      setLiveError(null);
      toast.success('已获取手机拍照画面', '可以保存快照或提交监控分析。');
    };

    reader.onerror = () => {
      setLiveError('读取手机拍照画面失败，请重新拍摄。');
      toast.error('拍照读取失败', '请重新拍摄或检查系统相册权限。');
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const postFrameAnalysis = async (showSuccessToast = false, sessionIdOverride?: string) => {
    const activeSessionId = sessionIdOverride ?? monitorSession?.sessionId;

    if (!activeSessionId || captureLockRef.current) {
      return;
    }

    if (!navigator.onLine) {
      const message = '当前设备未联网。摄像头预览可继续使用，监控分析需要联网后恢复。';
      setLiveError(message);
      return;
    }

    const image = captureCurrentFrame();

    if (!image) {
      setLiveError('当前没有可提交的监控画面，请确认摄像头预览已正常启动');
      return;
    }

    captureLockRef.current = true;
    setIsSubmittingFrame(true);
    setLiveError(null);

    try {
      const response = await fetch('/api/monitor/frame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          image,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as MonitorFrameResponse;

      if (!data.success || !data.data) {
        throw new Error(data.message || '实时监控分析失败');
      }

      onMonitorFrame(data.data);
      setLastCaptureAt(new Date().toISOString());

      if (showSuccessToast) {
        toast.success('监控帧已分析', `当前评分 ${data.data.result.score}`);
      }
    } catch (error) {
      const message = isLikelyNetworkError(error)
        ? '无法连接到后端监控服务，请检查网络后重试。'
        : error instanceof Error
          ? error.message
          : '实时监控分析失败';
      setLiveError(message);
      toast.error('实时监控分析失败', message);
    } finally {
      captureLockRef.current = false;
      setIsSubmittingFrame(false);
    }
  };

  const handleStartMonitoring = async () => {
    try {
      if (!streamRef.current && !manualSnapshot) {
        await startPreview(selectedCameraId || undefined);
      }

      if (!navigator.onLine) {
        const message = '摄像头预览已可用，但当前离线，暂时无法创建 Garden 监控会话。';
        setLiveError(message);
        toast.warn('当前处于离线模式', message);
        return;
      }

      setLiveError(null);

      const response = await fetch('/api/monitor/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          deviceName: `${navigator.platform || '未知系统'} 浏览器`,
          cameraLabel: getSelectedCameraLabel(),
          captureIntervalSeconds,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as MonitorStartResponse;

      if (!data.success || !data.session) {
        throw new Error(data.message || '创建监控会话失败');
      }

      onMonitorSessionChange(data.session);
      onMonitorEventsChange([]);
      setIsRunning(true);
      setIsPaused(false);
      setLastCaptureAt(null);
      toast.success('监控已开始', `默认每 ${captureIntervalSeconds} 秒分析一次`);
      await postFrameAnalysis(false, data.session.sessionId);
    } catch (error) {
      const message = isLikelyNetworkError(error)
        ? '无法连接到后端监控服务，请检查网络后重试。'
        : error instanceof Error
          ? error.message
          : '开始监控失败';
      setLiveError(message);
      toast.error('开始监控失败', message);
    }
  };

  const handlePauseMonitoring = () => {
    setIsPaused((prev) => {
      const nextPaused = !prev;

      onMonitorSessionChange((current) =>
        current
          ? {
              ...current,
              status: nextPaused ? 'paused' : 'monitoring',
            }
          : current
      );

      return nextPaused;
    });
    toast.info(isPaused ? '监控继续运行' : '监控已暂停');
  };

  const handleStopMonitoring = async () => {
    if (!monitorSession?.sessionId) {
      setIsRunning(false);
      setIsPaused(false);
      return;
    }

    try {
      const response = await fetch('/api/monitor/session/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId: monitorSession.sessionId }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as MonitorStartResponse;

      if (!data.success || !data.session) {
        throw new Error(data.message || '停止监控失败');
      }

      onMonitorSessionChange(data.session);
      toast.success('监控已停止', '本次会话已经归档到监控历史');
    } catch (error) {
      const message = error instanceof Error ? error.message : '停止监控失败';
      setLiveError(message);
      toast.error('停止监控失败', message);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
    }
  };

  const handleSaveSnapshot = () => {
    const image = captureCurrentFrame();

    if (!image) {
      setLiveError('当前无法保存截图，请确认摄像头画面已经加载完成');
      toast.warn('无法保存截图', '请确认摄像头画面已经加载完成');
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = image;
    anchor.download = `shijing-monitor-${Date.now()}.jpg`;
    anchor.click();
    toast.success('快照已保存', '截图文件已交给浏览器下载');
  };

  const handleRefreshCamera = async (cameraId = selectedCameraId) => {
    try {
      await startPreview(cameraId || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : '摄像头启动失败';
      setLiveError(message);
      toast.error('摄像头启动失败', message);
    }
  };

  useEffect(() => {
    if (!isRunning || isPaused || !monitorSession?.sessionId) {
      return;
    }

    const timer = window.setInterval(() => {
      void postFrameAnalysis();
    }, captureIntervalSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [captureIntervalSeconds, isPaused, isRunning, monitorSession?.sessionId]);

  const recentRiskText = latestEvent
    ? latestEvent.riskLevel === 'high'
      ? '高风险'
      : latestEvent.riskLevel === 'medium'
        ? '中风险'
        : '低风险'
    : '待检测';

  return (
    <div className="p-4 flex flex-col gap-4 pb-24">
      <section className="rounded-[2rem] overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="relative aspect-[16/10] bg-slate-950">
          {isCameraLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200 gap-3">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-sm font-semibold">正在启动摄像头...</p>
            </div>
          )}

          {!isCameraLoading && permissionState === 'denied' && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center text-slate-300 gap-3 px-6 pb-28">
              <AlertTriangle className="text-amber-400" size={32} />
              <p className="text-sm font-semibold">无法访问摄像头</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                请检查 Android 摄像头权限；如果当前 WebView 不支持实时预览，可以先使用手机拍照提交单帧分析。
              </p>
              <button
                type="button"
                onClick={() => cameraCaptureInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/20"
              >
                <ImagePlus size={16} />
                使用手机拍照
              </button>
            </div>
          )}

          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${manualSnapshot ? 'opacity-0' : ''}`}
            muted
            playsInline
          />
          {manualSnapshot ? (
            <img src={manualSnapshot} alt="手机拍照画面" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={cameraCaptureInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleMobileCaptureChange}
          />

          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${
              isRunning && !isPaused ? 'bg-red-500 text-white' : 'bg-black/50 text-white'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning && !isPaused ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
              {isRunning ? (isPaused ? 'PAUSED' : 'LIVE') : 'READY'}
            </div>
            <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/45 text-white border border-white/10">
              {getSelectedCameraLabel()}
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-4 z-20 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={handleStartMonitoring}
              disabled={isRunning || isCameraLoading}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={18} />
              开始监控
            </button>
            <button
              type="button"
              onClick={handlePauseMonitoring}
              disabled={!isRunning}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pause size={18} />
              {isPaused ? '继续监控' : '暂停'}
            </button>
            <button
              type="button"
              onClick={handleStopMonitoring}
              disabled={!isRunning && !monitorSession}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square size={18} />
              停止
            </button>
            <button
              type="button"
              onClick={() => void postFrameAnalysis(true)}
              disabled={!monitorSession || isSubmittingFrame}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/95 text-slate-900 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingFrame ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              手动分析
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSaveSnapshot}
              className="flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800"
            >
              <Download size={18} className="text-blue-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">保存快照</span>
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshCamera()}
              className="flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800"
            >
              <Webcam size={18} className="text-blue-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">刷新摄像头</span>
            </button>
            <button
              type="button"
              onClick={() => cameraCaptureInputRef.current?.click()}
              className="col-span-2 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40"
            >
              <ImagePlus size={18} className="text-blue-500" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-200">手机拍照兜底</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">监控设备</span>
              <select
                value={selectedCameraId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedCameraId(nextId);
                  void handleRefreshCamera(nextId);
                }}
                className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none"
              >
                {cameras.length === 0 ? <option value="">默认摄像头</option> : null}
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `摄像头 ${camera.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">抓帧频率</span>
              <select
                value={captureIntervalSeconds}
                onChange={(event) => setCaptureIntervalSeconds(Number(event.target.value))}
                className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none"
              >
                {[5, 8, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    每 {value} 秒分析一次
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <ShieldCheck size={16} className="text-blue-500" />
            最新评分
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 dark:text-slate-100">
            {latestScore !== null ? latestScore : '--'}
          </div>
          <p className="mt-2 text-xs text-slate-500">平均分 {averageScore !== null ? averageScore.toFixed(1) : '--'}</p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Sparkles size={16} className="text-amber-500" />
            风险等级
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">{recentRiskText}</div>
          <p className="mt-2 text-xs text-slate-500">
            {latestEvent ? latestEvent.changeLabel : '等待第一帧监控结果'}
          </p>
        </div>
      </section>

      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock3 size={18} className="text-blue-500" />
              监控摘要
            </h3>
            <p className="text-xs text-slate-400 mt-1">把持续监控结果转成可读的环境变化摘要</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Link
              to="/monitor-history"
              className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/40"
            >
              历史报告
            </Link>
            {lastCaptureAt ? (
              <div className="text-[11px] text-slate-400">上次分析：{new Date(lastCaptureAt).toLocaleTimeString()}</div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">会话</div>
            <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">
              {monitorSession?.status ? monitorSession.status.toUpperCase() : 'IDLE'}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">事件数</div>
            <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{monitorSession?.eventCount ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">高风险</div>
            <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{monitorSession?.alertCount ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">设备</div>
            <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              {monitorSession?.deviceName || '当前浏览器'}
            </div>
          </div>
        </div>

        {scoreHistory.length > 0 ? (
          <div className="mt-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">最近评分波动</div>
            <div className="flex items-end gap-2 h-24">
              {scoreHistory.map((item) => (
                <div key={item.id} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-2xl ${
                      item.riskLevel === 'high'
                        ? 'bg-red-400'
                        : item.riskLevel === 'medium'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{ height: `${Math.max(16, item.score)}%` }}
                  />
                  <span className="text-[10px] text-slate-400">{item.score}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {liveError ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 leading-relaxed">
          {liveError}
        </div>
      ) : null}

      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-slate-900 dark:text-slate-100">监控事件时间轴</h3>
            <p className="text-xs text-slate-400 mt-1">Garden 按时间记录桌面变化和清洁建议</p>
          </div>
          {isSubmittingFrame ? <Loader2 size={18} className="animate-spin text-blue-500" /> : null}
        </div>

        {monitorEvents.length > 0 ? (
          <div className="space-y-3">
            {monitorEvents.map((item) => (
              <div key={item.id} className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                      item.riskLevel === 'high'
                        ? 'bg-red-500'
                        : item.riskLevel === 'medium'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.event}</h4>
                      <div className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 font-bold self-start">
                        {item.changeLabel}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{item.action}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span>评分 {item.score}</span>
                      <span>风险 {item.riskLevel}</span>
                    </div>

                    {item.snapshot ? (
                      <img
                        src={item.snapshot}
                        alt="监控快照"
                        className="mt-3 w-full h-40 object-cover rounded-2xl border border-slate-200 dark:border-slate-800"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-400">
            监控开始后，这里会持续记录桌面变化、整洁度波动和清洁建议。
          </div>
        )}
      </section>
    </div>
  );
};

export default LiveView;
