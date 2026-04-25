import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Eye, EyeOff, Loader2, Server, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthUser } from '../types';
import { useToast } from '../src/toast';
import { getApiBaseUrl, isLikelyNetworkError } from '../src/apiClient';

interface LoginViewProps {
  onLogin: (user: AuthUser, token: string) => void;
}

interface LoginLocationState {
  accountId?: string;
  returnTo?: string;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingService, setCheckingService] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const apiBaseUrl = getApiBaseUrl() || '当前同源服务';

  useEffect(() => {
    const state = location.state as LoginLocationState | null;

    if (state?.accountId) {
      setAccountId(state.accountId);
    }
  }, [location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim(), password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.user || !data.token) {
        setError(data.message || '登录失败，请检查账号和密码。');
        return;
      }

      onLogin(data.user as AuthUser, data.token as string);
      const state = location.state as LoginLocationState | null;
      navigate(state?.returnTo || '/', { replace: true });
    } catch (requestError) {
      const message = isLikelyNetworkError(requestError)
        ? `无法连接到后端服务。请确认手机可以访问 ${apiBaseUrl}，服务器已启动，并且 APK 是在正确的 VITE_API_BASE_URL 下重新构建的。`
        : '登录请求失败，请稍后再试。';
      setError(message);
      toast.error('登录网络异常', message);
    } finally {
      setLoading(false);
    }
  };

  const checkServiceConnection = async () => {
    setCheckingService(true);
    setServiceStatus(null);

    try {
      const response = await fetch('/api/session');

      if (response.ok || response.status === 401) {
        setServiceStatus(`后端服务可访问：${apiBaseUrl}`);
        toast.success('服务连接正常', apiBaseUrl);
        return;
      }

      setServiceStatus(`后端已响应，但状态异常：HTTP ${response.status}`);
    } catch (requestError) {
      const message = isLikelyNetworkError(requestError)
        ? `无法访问后端：${apiBaseUrl}。请检查手机网络、服务器防火墙、端口 3000 和 APK 打包时的 VITE_API_BASE_URL。`
        : '服务检查失败，请稍后再试。';
      setServiceStatus(message);
      toast.error('服务连接失败', message);
    } finally {
      setCheckingService(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full mx-auto space-y-8"
      >
        <div className="text-center">
          <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">欢迎回来</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">请输入注册成功后获得的 7 位数字账号和密码</p>
        </div>

        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-100">
          <div className="flex items-center gap-2 font-black">
            <Server size={17} />
            当前后端地址
          </div>
          <p className="mt-2 break-words text-xs font-bold opacity-80">{apiBaseUrl}</p>
          <button
            type="button"
            onClick={() => void checkServiceConnection()}
            disabled={checkingService}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {checkingService ? <Loader2 size={14} className="animate-spin" /> : <WifiOff size={14} />}
            检查服务连接
          </button>
          {serviceStatus ? <p className="mt-3 break-words text-xs font-bold">{serviceStatus}</p> : null}
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="text-slate-400" size={20} />
              </div>
              <input
                type="text"
                required
                inputMode="numeric"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="block w-full pl-11 pr-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="请输入 7 位数字账号"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="text-slate-400" size={20} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-11 pr-12 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="请输入注册时设置的密码"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm font-bold text-center"
            >
              {error}
            </motion.p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => toast.info('忘记密码说明', '当前版本请在登录后前往“设置 - 隐私与安全”修改密码。')}
            >
              忘记密码？
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-blue-200 dark:shadow-none disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : (
              <>
                立即登录
                <ArrowRight size={24} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-slate-500 dark:text-slate-400 font-medium">
          还没有账号？{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-blue-600 dark:text-blue-400 font-black hover:underline"
          >
            立即注册
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default LoginView;
