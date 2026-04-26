import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthUser, ThemePreference, UserPreferences } from '../types';
import { useToast } from '../src/toast';

interface SettingsViewProps {
  user: AuthUser;
  authToken: string;
  preferences: UserPreferences | null;
  onPreferencesChange: (value: UserPreferences) => void;
  onLogout: () => void;
  onUserUpdate: (user: AuthUser, token?: string) => void;
}

interface SettingItemProps {
  icon: React.ElementType;
  label: string;
  value?: string;
  onClick?: () => void;
  color?: string;
}

type ModalType = 'security' | 'profile' | 'preferences' | null;

interface HealthStatusResponse {
  success: boolean;
  status: 'ok' | 'degraded';
  services: {
    server: { status: 'ok'; message: string };
    database: { status: 'ok' | 'error'; message: string };
    garden: {
      status: 'ok' | 'error' | 'skipped';
      configured: boolean;
      message: string;
    };
  };
}

const DEFAULT_PREFERENCES: UserPreferences = {
  themePreference: 'system',
  defaultMonitorIntervalSeconds: 8,
  autoCreateTaskEnabled: true,
  notificationEnabled: true,
  highRiskAlertEnabled: true,
};

const themePreferenceLabel: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色模式',
  dark: '深色模式',
};

const SettingItem: React.FC<SettingItemProps> = ({ icon: Icon, label, value, onClick, color = 'text-slate-400' }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between border-b border-slate-50 bg-white p-4 transition-colors last:border-0 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800"
  >
    <div className="flex items-center gap-4">
      <div className={`rounded-xl bg-slate-50 p-2 dark:bg-slate-800 ${color}`}>
        <Icon size={20} />
      </div>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {value ? <span className="text-xs font-medium text-slate-400">{value}</span> : null}
      <ChevronRight size={16} className="text-slate-300" />
    </div>
  </button>
);

const ToggleCard: React.FC<{
  title: string;
  desc: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ title, desc, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900"
  >
    <div>
      <div className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{desc}</p>
    </div>
    <span
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </span>
  </button>
);

const getPasswordStrength = (pwd: string) => {
  if (!pwd) {
    return { label: '未填写', color: 'bg-slate-200', width: '0%' };
  }

  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (/[A-Z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  switch (score) {
    case 1:
      return { label: '较弱', color: 'bg-red-500', width: '25%' };
    case 2:
      return { label: '一般', color: 'bg-orange-500', width: '50%' };
    case 3:
      return { label: '较强', color: 'bg-blue-500', width: '75%' };
    case 4:
      return { label: '很强', color: 'bg-green-500', width: '100%' };
    default:
      return { label: '极弱', color: 'bg-red-400', width: '10%' };
  }
};

const getStatusClassName = (status: 'ok' | 'error' | 'skipped') => {
  switch (status) {
    case 'ok':
      return 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200';
    case 'skipped':
      return 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'border-red-100 bg-red-50 text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200';
  }
};

const getStatusLabel = (status: 'ok' | 'error' | 'skipped') => {
  switch (status) {
    case 'ok':
      return '正常';
    case 'skipped':
      return '未检查';
    default:
      return '异常';
  }
};

const NativeSheet: React.FC<{
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}> = ({ title, subtitle, onClose, children, footer }) => (
  <div className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm">
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-hidden rounded-t-[2rem] border-t border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="border-b border-slate-200 bg-white/90 px-5 pb-4 pt-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-50">{title}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="max-h-[calc(90vh-170px)] space-y-5 overflow-y-auto px-5 py-5">{children}</div>
      <div className="border-t border-slate-200 bg-white/90 px-5 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        {footer}
      </div>
    </motion.div>
  </div>
);

const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  authToken,
  preferences,
  onPreferencesChange,
  onLogout,
  onUserUpdate,
}) => {
  const toast = useToast();
  const [robotConnected, setRobotConnected] = useState(false);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [profileNickname, setProfileNickname] = useState(user.nickname);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(user.avatar ?? null);
  const [preferencesDraft, setPreferencesDraft] = useState<UserPreferences>(preferences ?? DEFAULT_PREFERENCES);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthError, setHealthError] = useState('');
  const [loadingHealth, setLoadingHealth] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreferencesDraft(preferences ?? DEFAULT_PREFERENCES);
  }, [preferences]);

  const loadHealthStatus = async () => {
    setLoadingHealth(true);
    setHealthError('');

    try {
      const response = await fetch('/api/health', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = (await response.json().catch(() => null)) as (HealthStatusResponse & { message?: string }) | null;

      if (!response.ok || !data?.success) {
        setHealth(null);
        setHealthError(data?.message || '系统状态检查失败');
        return;
      }

      setHealth(data);
    } catch {
      setHealth(null);
      setHealthError('无法读取系统健康状态，请检查后端服务是否仍在运行。');
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    void loadHealthStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const resetMessages = () => {
    setError('');
    setSuccessMessage('');
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const openModal = (type: ModalType) => {
    resetMessages();

    if (type === 'profile') {
      setProfileNickname(user.nickname);
      setProfileAvatar(user.avatar ?? null);
    }

    if (type === 'security') {
      resetPasswordForm();
    }

    if (type === 'preferences') {
      setPreferencesDraft(preferences ?? DEFAULT_PREFERENCES);
    }

    setActiveModal(type);
  };

  const closeModal = () => {
    resetMessages();
    setSubmitting(false);
    setActiveModal(null);
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setProfileAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async () => {
    resetMessages();

    if (!profileNickname.trim()) {
      setError('昵称不能为空。');
      toast.warn('昵称不能为空');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          nickname: profileNickname.trim(),
          avatar: profileAvatar,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.user) {
        setError(data.message || '个人资料更新失败。');
        toast.error('个人资料更新失败', data.message || '请稍后重试');
        return;
      }

      onUserUpdate(data.user as AuthUser, data.token as string | undefined);
      setSuccessMessage('个人资料已更新。');
      toast.success('个人资料已更新');
    } catch {
      setError('网络连接失败，请稍后重试。');
      toast.error('网络连接失败', '个人资料暂时无法保存');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordSave = async () => {
    resetMessages();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('请完整填写密码信息。');
      toast.warn('密码信息不完整', '请完整填写当前密码、新密码和确认密码');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码必须完全一致。');
      toast.warn('两次密码不一致');
      return;
    }

    if (newPassword.length < 6) {
      setError('新密码长度至少需要 6 位。');
      toast.warn('新密码太短', '新密码长度至少需要 6 位');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || '密码修改失败。');
        toast.error('密码修改失败', data.message || '请稍后重试');
        return;
      }

      setSuccessMessage('密码修改成功。');
      toast.success('密码修改成功');
      resetPasswordForm();
    } catch {
      setError('网络连接失败，请稍后重试。');
      toast.error('网络连接失败', '密码暂时无法保存');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreferencesSave = async () => {
    resetMessages();
    setSubmitting(true);

    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(preferencesDraft),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        preferences?: UserPreferences;
      } | null;

      if (!response.ok || !data?.success || !data.preferences) {
        setError(data?.message || '保存使用偏好失败。');
        toast.error('保存偏好失败', data?.message || '请稍后重试');
        return;
      }

      onPreferencesChange(data.preferences);
      setPreferencesDraft(data.preferences);
      setSuccessMessage('使用偏好已保存到当前账号。');
      toast.success('使用偏好已保存');
    } catch {
      setError('网络连接失败，请稍后重试。');
      toast.error('网络连接失败', '使用偏好暂时无法保存');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="px-1">
        <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">设置</h2>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">系统配置与账号管理</p>
      </div>

      <section className="flex items-center gap-4 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white bg-blue-50 dark:border-slate-800 dark:bg-blue-900/20">
          {user.avatar ? (
            <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-black italic text-blue-600">
              {user.nickname.charAt(0) || 'U'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-black text-slate-800 dark:text-slate-100">{user.nickname}</h3>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-widest text-slate-400">账号：{user.accountId}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-2xl bg-red-50 p-3 text-red-500 transition-colors hover:bg-red-100 dark:bg-red-900/20"
        >
          <LogOut size={20} />
        </button>
      </section>

      <section className="space-y-3">
        <h3 className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">设备连接</h3>
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SettingItem
            icon={Bot}
            label="清洁机器人"
            value={robotConnected ? '已连接' : '未连接'}
            color="text-blue-500"
            onClick={() => setRobotConnected((value) => !value)}
          />
          <SettingItem
            icon={Camera}
            label="实时监控摄像头"
            value={cameraConnected ? '已连接' : '未连接'}
            color="text-green-500"
            onClick={() => setCameraConnected((value) => !value)}
          />
        </div>
      </section>

      <section className="rounded-[2rem] bg-slate-950 p-5 text-slate-50 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-300">
              <Server size={18} />
            </div>
            <div>
              <p className="text-sm font-black">系统状态中心</p>
              <p className="mt-1 text-xs text-slate-400">Garden 服务由后端 .env 统一配置，用户端不再单独填写 API Key。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadHealthStatus()}
            className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold"
          >
            {loadingHealth ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </button>
        </div>

        {healthError ? <p className="mt-3 text-xs leading-relaxed text-red-300">{healthError}</p> : null}

        {health ? (
          <div className="mt-4 grid grid-cols-1 gap-3">
            {[
              { label: '应用服务', service: health.services.server },
              { label: 'MySQL', service: health.services.database },
              { label: 'Garden 服务', service: health.services.garden },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 p-3">
                <div>
                  <p className="text-sm font-bold text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.service.message}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusClassName(item.service.status)}`}>
                  {getStatusLabel(item.service.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 p-4 text-xs leading-relaxed text-slate-400">
            正在等待系统状态结果。你可以点击右上角“刷新”重新检查。
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">使用偏好</h3>
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SettingItem
            icon={SlidersHorizontal}
            label="监控与任务偏好"
            value={`每 ${preferences?.defaultMonitorIntervalSeconds ?? DEFAULT_PREFERENCES.defaultMonitorIntervalSeconds} 秒`}
            color="text-blue-500"
            onClick={() => openModal('preferences')}
          />
          <SettingItem
            icon={Bell}
            label="通知提醒"
            value={(preferences?.notificationEnabled ?? DEFAULT_PREFERENCES.notificationEnabled) ? '已开启' : '已关闭'}
            color="text-amber-500"
            onClick={() => openModal('preferences')}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">通用</h3>
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SettingItem icon={ShieldCheck} label="隐私与安全" onClick={() => openModal('security')} />
          <SettingItem icon={User} label="个人资料" onClick={() => openModal('profile')} />
        </div>
      </section>

      <div className="pb-10 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">视净 ShiJing v1.3.1</p>
      </div>

      <AnimatePresence>
        {activeModal === 'security' ? (
          <NativeSheet
            title="修改密码"
            subtitle="采用和注册时一致的密码强度规则，并同步更新到 MySQL。"
            onClose={closeModal}
            footer={
              <div className="space-y-3">
                {error ? <p className="text-center text-sm font-bold text-red-500">{error}</p> : null}
                {successMessage ? (
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-green-600">
                    <CheckCircle2 size={16} />
                    <span>{successMessage}</span>
                  </div>
                ) : null}
                <div className="flex gap-3">
                  <button type="button" onClick={closeModal} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handlePasswordSave}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                    保存
                  </button>
                </div>
              </div>
            }
          >
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">验证当前身份</p>
              </div>
              <div className="p-4">
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-800 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="当前密码"
                  />
                  <button type="button" onClick={() => setShowCurrentPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                    {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">设置新密码</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-800 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="新密码"
                  />
                  <button type="button" onClick={() => setShowNewPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                    {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                {newPassword ? (
                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-500">密码强度</span>
                      <span className="text-slate-700 dark:text-slate-200">{strength.label}</span>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <motion.div initial={{ width: 0 }} animate={{ width: strength.width }} className={`h-full ${strength.color} transition-all duration-500`} />
                    </div>
                  </div>
                ) : null}

                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={`block w-full rounded-2xl border bg-slate-50 px-4 py-4 text-slate-800 outline-none placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100 ${
                      showMismatch ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                    placeholder="确认新密码"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                {showMismatch ? <p className="text-xs text-red-500">确认密码必须与新密码完全一致。</p> : null}
                {passwordsMatch ? <p className="text-xs text-green-600">两次输入的新密码一致。</p> : null}
              </div>
            </div>
          </NativeSheet>
        ) : null}

        {activeModal === 'profile' ? (
          <NativeSheet
            title="个人资料"
            subtitle="修改昵称和头像后，会同步到当前账号与数据库。"
            onClose={closeModal}
            footer={
              <div className="space-y-3">
                {error ? <p className="text-center text-sm font-bold text-red-500">{error}</p> : null}
                {successMessage ? (
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-green-600">
                    <CheckCircle2 size={16} />
                    <span>{successMessage}</span>
                  </div>
                ) : null}
                <div className="flex gap-3">
                  <button type="button" onClick={closeModal} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleProfileSave}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                    保存
                  </button>
                </div>
              </div>
            }
          >
            <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
              >
                {profileAvatar ? (
                  <img src={profileAvatar} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-black italic text-blue-600">{profileNickname.charAt(0) || 'U'}</span>
                )}
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-bold text-blue-600 dark:text-blue-400">
                更换头像
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">昵称</p>
              </div>
              <div className="p-4">
                <input
                  type="text"
                  value={profileNickname}
                  onChange={(event) => setProfileNickname(event.target.value)}
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-800 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="请输入新的昵称"
                />
              </div>
            </div>
          </NativeSheet>
        ) : null}

        {activeModal === 'preferences' ? (
          <NativeSheet
            title="使用偏好"
            subtitle="这些设置会保存到 MySQL，并影响实时监控、自动任务和通知提醒。"
            onClose={closeModal}
            footer={
              <div className="space-y-3">
                {error ? <p className="text-center text-sm font-bold text-red-500">{error}</p> : null}
                {successMessage ? (
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-green-600">
                    <CheckCircle2 size={16} />
                    <span>{successMessage}</span>
                  </div>
                ) : null}
                <div className="flex gap-3">
                  <button type="button" onClick={closeModal} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    关闭
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handlePreferencesSave()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                    保存偏好
                  </button>
                </div>
              </div>
            }
          >
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">显示与监控</p>
              </div>
              <div className="space-y-4 p-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">主题偏好</span>
                  <select
                    value={preferencesDraft.themePreference}
                    onChange={(event) =>
                      setPreferencesDraft((current) => ({
                        ...current,
                        themePreference: event.target.value as ThemePreference,
                      }))
                    }
                    className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {(['system', 'light', 'dark'] as ThemePreference[]).map((value) => (
                      <option key={value} value={value}>
                        {themePreferenceLabel[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">默认监控抓帧频率</span>
                  <select
                    value={preferencesDraft.defaultMonitorIntervalSeconds}
                    onChange={(event) =>
                      setPreferencesDraft((current) => ({
                        ...current,
                        defaultMonitorIntervalSeconds: Number(event.target.value),
                      }))
                    }
                    className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[5, 8, 10, 15, 20, 30].map((value) => (
                      <option key={value} value={value}>
                        每 {value} 秒分析一次
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <ToggleCard
                title="自动生成清洁任务"
                desc="当图片分析或监控结果低于阈值时，自动写入任务中心。关闭后仍会保留分析和动态记录。"
                checked={preferencesDraft.autoCreateTaskEnabled}
                onChange={(value) =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    autoCreateTaskEnabled: value,
                  }))
                }
              />
              <ToggleCard
                title="通知中心提醒"
                desc="关键分析、任务验证、账号变更等事件会进入通知中心，并在首页显示未读数量。"
                checked={preferencesDraft.notificationEnabled}
                onChange={(value) =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    notificationEnabled: value,
                  }))
                }
              />
              <ToggleCard
                title="高风险监控提醒"
                desc="实时监控发现高风险杂乱状态时生成未读通知，适合长期监控场景。"
                checked={preferencesDraft.highRiskAlertEnabled}
                onChange={(value) =>
                  setPreferencesDraft((current) => ({
                    ...current,
                    highRiskAlertEnabled: value,
                  }))
                }
              />
            </div>
          </NativeSheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default SettingsView;
