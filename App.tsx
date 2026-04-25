import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Bell, Bot, Camera, Home, Moon, Settings, Sparkles, Sun, User as UserIcon } from 'lucide-react';
import { AuthUser, Insight, MonitorEvent, MonitorFrameAnalysis, MonitorSessionSummary, UserPreferences } from './types';
import { ToastProvider } from './src/toast';
import { ConfirmProvider } from './src/confirm';
import { isLikelyNetworkError } from './src/apiClient';

const HomeView = lazy(() => import('./views/HomeView'));
const LiveView = lazy(() => import('./views/LiveView'));
const MonitorHistoryView = lazy(() => import('./views/MonitorHistoryView'));
const AnalysisHistoryView = lazy(() => import('./views/AnalysisHistoryView'));
const AIView = lazy(() => import('./views/AIView'));
const RobotView = lazy(() => import('./views/RobotView'));
const AllActivitiesView = lazy(() => import('./views/AllActivitiesView'));
const NotificationsView = lazy(() => import('./views/NotificationsView'));
const LoginView = lazy(() => import('./views/LoginView'));
const RegisterView = lazy(() => import('./views/RegisterView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

const SESSION_STORAGE_KEY = 'auth_token';
const USER_STORAGE_KEY = 'user';
const MONITOR_SESSION_STORAGE_KEY = 'monitor_session';
const MONITOR_EVENTS_STORAGE_KEY = 'monitor_events';
const THEME_STORAGE_KEY = 'theme';
const LEGACY_TOKEN_MAX_LENGTH = 4096;

const NetworkBanner: React.FC<{ isOnline: boolean }> = ({ isOnline }) =>
  isOnline ? null : (
    <div className="mx-4 mt-3 rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
      当前处于离线模式：应用页面可继续打开，部分历史数据会显示上次缓存内容；登录校验、Garden 分析、监控同步和数据保存需要联网后使用。
    </div>
  );

const readStoredJson = <T,>(key: string, fallback: T): T => {
  const saved = localStorage.getItem(key);

  if (!saved) {
    return fallback;
  }

  try {
    return JSON.parse(saved) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
};

const Navigation = () => {
  const location = useLocation();
  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/live', label: '监控', icon: Camera },
    { path: '/ai', label: '分析', icon: Sparkles },
    { path: '/robot', label: '任务', icon: Bot },
    { path: '/settings', label: '设置', icon: Settings },
  ];

  if (
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/all-activities' ||
    location.pathname === '/notifications'
  ) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-20 items-center justify-around border-t border-slate-200 bg-white/90 backdrop-blur-lg transition-colors dark:border-slate-800 dark:bg-slate-900/90 safe-bottom">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          location.pathname === item.path ||
          (item.path === '/live' && location.pathname === '/monitor-history') ||
          (item.path === '/ai' && location.pathname === '/analysis-history');

        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex h-full w-full flex-col items-center justify-center transition-all ${
              isActive ? 'scale-110 text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span className="mt-1 text-[10px] font-bold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  user: AuthUser | null;
  unreadNotificationCount: number;
}

const Header: React.FC<HeaderProps> = ({ isDark, onToggleTheme, user, unreadNotificationCount }) => {
  const location = useLocation();
  const navigate = useNavigate();

  if (
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/all-activities' ||
    location.pathname === '/notifications'
  ) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 pb-3 pt-8 backdrop-blur-md transition-colors dark:border-slate-900 dark:bg-slate-950/80">
      <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <h1 className="shrink-0 text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">视净</h1>
        <p className="truncate text-sm font-extrabold tracking-tight text-slate-500 dark:text-slate-400">
          ——您的智能桌面清洁助手
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-full p-2 text-slate-500 transition-all hover:bg-slate-100 active:rotate-12 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Bell size={20} />
          {unreadNotificationCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white">
              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="overflow-hidden rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="Avatar" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <UserIcon size={20} />
          )}
        </button>
      </div>
    </header>
  );
};

const PageLoader = () => (
  <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500 dark:border-slate-800" />
    <p className="text-xs font-bold uppercase tracking-[0.18em]">Loading View</p>
  </div>
);

const buildMonitorInsight = (event: MonitorEvent): Insight => ({
  id: `monitor-${event.id}`,
  time: new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  type: event.riskLevel === 'high' ? 'warn' : event.eventType === 'improved' ? 'success' : 'info',
  event: event.event,
  action: event.action,
  score: event.score,
  imageUrl: event.snapshot ?? undefined,
  suggestions: event.suggestions,
});

const shouldCreateMonitorInsight = (event: MonitorEvent) =>
  event.eventType === 'baseline' ||
  event.eventType === 'declined' ||
  event.eventType === 'alert' ||
  event.eventType === 'improved';

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);

    if (saved) {
      return saved === 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem(SESSION_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => readStoredJson<AuthUser | null>(USER_STORAGE_KEY, null));
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [monitorSession, setMonitorSession] = useState<MonitorSessionSummary | null>(() =>
    readStoredJson<MonitorSessionSummary | null>(MONITOR_SESSION_STORAGE_KEY, null)
  );
  const [monitorEvents, setMonitorEvents] = useState<MonitorEvent[]>(() =>
    readStoredJson<MonitorEvent[]>(MONITOR_EVENTS_STORAGE_KEY, [])
  );
  const [insights, setInsights] = useState<Insight[]>(() => readStoredJson<Insight[]>('insights', []));
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);

    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);

    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('insights', JSON.stringify(insights.slice(0, 100)));
    } catch (error) {
      console.warn('本地 insights 存储写入失败:', error);
      localStorage.removeItem('insights');
    }
  }, [insights]);

  useEffect(() => {
    if (monitorSession) {
      localStorage.setItem(MONITOR_SESSION_STORAGE_KEY, JSON.stringify(monitorSession));
      return;
    }

    localStorage.removeItem(MONITOR_SESSION_STORAGE_KEY);
  }, [monitorSession]);

  useEffect(() => {
    localStorage.setItem(MONITOR_EVENTS_STORAGE_KEY, JSON.stringify(monitorEvents.slice(0, 30)));
  }, [monitorEvents]);

  useEffect(() => {
    const root = window.document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      return;
    }

    root.classList.remove('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
  }, [isDark]);

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem(SESSION_STORAGE_KEY);
      const cachedUser = readStoredJson<AuthUser | null>(USER_STORAGE_KEY, null);

      if (!storedToken) {
        setAuthReady(true);
        return;
      }

      if (storedToken.length > LEGACY_TOKEN_MAX_LENGTH) {
        setAuthToken(null);
        setUser(null);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setAuthReady(true);
        return;
      }

      try {
        const response = await fetch('/api/session', {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Session expired');
        }

        const data = await response.json();

        if (!data.success || !data.user) {
          throw new Error('Invalid session');
        }

        setAuthToken(storedToken);
        setUser(data.user as AuthUser);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      } catch (error) {
        if (cachedUser && isLikelyNetworkError(error)) {
          setAuthToken(storedToken);
          setUser(cachedUser);
          setAuthReady(true);
          return;
        }

        setAuthToken(null);
        setUser(null);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
      } finally {
        setAuthReady(true);
      }
    };

    void restoreSession();
  }, []);

  useEffect(() => {
    const loadMonitorOverview = async () => {
      if (!authToken) {
        setMonitorSession(null);
        setMonitorEvents([]);
        return;
      }

      try {
        const response = await fetch('/api/monitor/overview', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load monitor overview');
        }

        const data = (await response.json()) as {
          success: boolean;
          session: MonitorSessionSummary | null;
          events: MonitorEvent[];
        };

        if (!data.success) {
          return;
        }

        setMonitorSession(data.session);
        setMonitorEvents(data.events ?? []);
      } catch (error) {
        console.warn('读取监控总览失败:', error);
      }
    };

    if (authReady) {
      void loadMonitorOverview();
    }
  }, [authReady, authToken]);

  useEffect(() => {
    const loadAccountProductState = async () => {
      if (!authToken) {
        setUserPreferences(null);
        setUnreadNotificationCount(0);
        return;
      }

      try {
        const [preferencesResponse, notificationsResponse] = await Promise.all([
          fetch('/api/preferences', {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }),
          fetch('/api/notifications?status=unread&limit=1', {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }),
        ]);

        const preferencesData = (await preferencesResponse.json().catch(() => null)) as {
          success?: boolean;
          preferences?: UserPreferences;
        } | null;
        const notificationsData = (await notificationsResponse.json().catch(() => null)) as {
          success?: boolean;
          unreadCount?: number;
        } | null;

        if (preferencesResponse.ok && preferencesData?.success && preferencesData.preferences) {
          setUserPreferences(preferencesData.preferences);
        }

        if (notificationsResponse.ok && notificationsData?.success) {
          setUnreadNotificationCount(Number(notificationsData.unreadCount ?? 0));
        }
      } catch (error) {
        console.warn('读取账号产品状态失败:', error);
      }
    };

    if (authReady) {
      void loadAccountProductState();
    }
  }, [authReady, authToken]);

  useEffect(() => {
    if (!userPreferences) {
      return;
    }

    if (userPreferences.themePreference === 'system') {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      return;
    }

    setIsDark(userPreferences.themePreference === 'dark');
  }, [userPreferences]);

  const handleLogin = (userData: AuthUser, token: string) => {
    setUser(userData);
    setAuthToken(token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    localStorage.setItem(SESSION_STORAGE_KEY, token);
  };

  const handleUserUpdate = (userData: AuthUser, token?: string) => {
    setUser(userData);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));

    if (token) {
      setAuthToken(token);
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setAuthToken(null);
    setUserPreferences(null);
    setUnreadNotificationCount(0);
    setMonitorSession(null);
    setMonitorEvents([]);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(MONITOR_SESSION_STORAGE_KEY);
    localStorage.removeItem(MONITOR_EVENTS_STORAGE_KEY);
  };

  const handleMonitorFrame = (payload: MonitorFrameAnalysis) => {
    setMonitorSession(payload.session);
    setMonitorEvents((prev) => {
      const next = [payload.event, ...prev.filter((item) => item.id !== payload.event.id)];
      return next.slice(0, 30);
    });

    if (!shouldCreateMonitorInsight(payload.event)) {
      return;
    }

    const newInsight = buildMonitorInsight(payload.event);
    setInsights((prev) => {
      const next = [newInsight, ...prev.filter((item) => item.id !== newInsight.id)];
      return next.slice(0, 100);
    });
  };

  const toggleTheme = () => setIsDark((value) => !value);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        正在验证登录状态...
      </div>
    );
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router>
          <div className="flex min-h-screen flex-col bg-slate-50 transition-colors duration-300 dark:bg-slate-950">
          <Header
            isDark={isDark}
            onToggleTheme={toggleTheme}
            user={user}
            unreadNotificationCount={unreadNotificationCount}
          />
          <NetworkBanner isOnline={isOnline} />
          <main className="flex-1 overflow-x-hidden pb-24">
            <Suspense fallback={<PageLoader />}>
              <Routes>
              <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginView onLogin={handleLogin} />} />
              <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterView />} />
              <Route
                path="/"
                element={
                  user && authToken ? (
                    <HomeView
                      authToken={authToken}
                      monitorSession={monitorSession}
                      monitorEvents={monitorEvents}
                      onUnreadCountChange={setUnreadNotificationCount}
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/live"
                element={
                  user && authToken ? (
                    <LiveView
                      authToken={authToken}
                      monitorSession={monitorSession}
                      monitorEvents={monitorEvents}
                      defaultCaptureIntervalSeconds={userPreferences?.defaultMonitorIntervalSeconds ?? 8}
                      onMonitorSessionChange={setMonitorSession}
                      onMonitorEventsChange={setMonitorEvents}
                      onMonitorFrame={handleMonitorFrame}
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/monitor-history"
                element={user && authToken ? <MonitorHistoryView authToken={authToken} /> : <Navigate to="/login" replace />}
              />
              <Route
                path="/ai"
                element={
                  user && authToken ? (
                    <AIView
                      authToken={authToken}
                      autoCreateTaskEnabled={userPreferences?.autoCreateTaskEnabled ?? true}
                      setInsights={setInsights}
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/analysis-history"
                element={user && authToken ? <AnalysisHistoryView authToken={authToken} /> : <Navigate to="/login" replace />}
              />
              <Route
                path="/robot"
                element={
                  user && authToken ? (
                    <RobotView authToken={authToken} />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/settings"
                element={
                  user && authToken ? (
                    <SettingsView
                      user={user}
                      authToken={authToken}
                      preferences={userPreferences}
                      onPreferencesChange={setUserPreferences}
                      onLogout={handleLogout}
                      onUserUpdate={handleUserUpdate}
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/all-activities"
                element={user && authToken ? <AllActivitiesView authToken={authToken} /> : <Navigate to="/login" replace />}
              />
              <Route
                path="/notifications"
                element={
                  user && authToken ? (
                    <NotificationsView authToken={authToken} onUnreadCountChange={setUnreadNotificationCount} />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              </Routes>
            </Suspense>
          </main>
          <Navigation />
          </div>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
