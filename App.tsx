import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Home, Camera, Sparkles, Bot, Settings, Sun, Moon, User as UserIcon } from 'lucide-react';
import HomeView from './views/HomeView';
import LiveView from './views/LiveView';
import AIView from './views/AIView';
import RobotView from './views/RobotView';
import AllActivitiesView from './views/AllActivitiesView';
import LoginView from './views/LoginView';
import RegisterView from './views/RegisterView';
import SettingsView from './views/SettingsView';
import { AuthUser, Insight } from './types';

const SESSION_STORAGE_KEY = 'auth_token';
const USER_STORAGE_KEY = 'user';
const GARDEN_API_KEY_STORAGE_KEY = 'garden_api_key';
const GARDEN_BASE_URL_STORAGE_KEY = 'garden_base_url';
const LEGACY_TOKEN_MAX_LENGTH = 4096;

const Navigation = () => {
  const location = useLocation();
  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/live', label: '实时', icon: Camera },
    { path: '/ai', label: '分析', icon: Sparkles },
    { path: '/robot', label: '机器人', icon: Bot },
    { path: '/settings', label: '设置', icon: Settings },
  ];

  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/all-activities') {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 flex justify-around items-center h-20 safe-bottom z-50 transition-colors">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;

        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center w-full h-full transition-all ${
              isActive ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-bold">{item.label}</span>
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
}

const Header: React.FC<HeaderProps> = ({ isDark, onToggleTheme, user }) => {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/all-activities') {
    return null;
  }

  return (
    <header className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-40 border-b border-slate-100 dark:border-slate-900 px-4 pt-8 pb-3 flex justify-between items-center transition-colors">
      <div className="flex items-baseline gap-2 whitespace-nowrap min-w-0">
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight shrink-0">视净</h1>
        <p className="text-sm font-extrabold text-slate-500 dark:text-slate-400 tracking-tight truncate">——您的智能桌面清洁助手</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all active:rotate-12"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors overflow-hidden"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="Avatar" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <UserIcon size={20} />
          )}
        </button>
      </div>
    </header>
  );
};

const readStoredUser = (): AuthUser | null => {
  const saved = localStorage.getItem(USER_STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as AuthUser;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
};

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');

      if (saved) {
        return saved === 'dark';
      }

      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return false;
  });
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem(SESSION_STORAGE_KEY));
  const [gardenApiKey, setGardenApiKey] = useState(() => localStorage.getItem(GARDEN_API_KEY_STORAGE_KEY) ?? '');
  const [gardenBaseUrl, setGardenBaseUrl] = useState(() => localStorage.getItem(GARDEN_BASE_URL_STORAGE_KEY) ?? '');
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [insights, setInsights] = useState<Insight[]>(() => {
    const saved = localStorage.getItem('insights');

    if (saved) {
      try {
        return JSON.parse(saved) as Insight[];
      } catch {
        localStorage.removeItem('insights');
      }
    }

    return [
      { id: '1', time: '10:30', event: '检测到桌面存在零散杂物', action: '建议进行一次快速整理', type: 'warn' },
      { id: '2', time: '09:15', event: '桌面整洁度评分：A', action: '当前环境保持良好', type: 'info' },
      { id: '3', time: '昨天', event: '已生成新的桌面诊断记录', action: '可前往分析页查看详情', type: 'success' },
    ];
  });

  useEffect(() => {
    try {
      // 限制最多存储100条记录，避免无限增长撑爆localStorage
      const maxSaveCount = 100;
      const limitedData = Array.isArray(insightsData) ? insightsData.slice(0, maxSaveCount) : insightsData;
      localStorage.setItem('insights', JSON.stringify(limitedData));
    } catch (error) {
      console.warn('本地存储写入失败，已清空历史数据:', error);
      // 写入失败时，直接清空对应存储，避免页面持续崩溃
      try {
        localStorage.removeItem('insights');
      } catch (clearErr) {
        console.error('清空存储失败:', clearErr);
      }
    }
  }, [insights]);

  useEffect(() => {
    if (gardenApiKey.trim()) {
      localStorage.setItem(GARDEN_API_KEY_STORAGE_KEY, gardenApiKey.trim());
      return;
    }

    localStorage.removeItem(GARDEN_API_KEY_STORAGE_KEY);
  }, [gardenApiKey]);

  useEffect(() => {
    if (gardenBaseUrl.trim()) {
      localStorage.setItem(GARDEN_BASE_URL_STORAGE_KEY, gardenBaseUrl.trim());
      return;
    }

    localStorage.removeItem(GARDEN_BASE_URL_STORAGE_KEY);
  }, [gardenBaseUrl]);

  useEffect(() => {
    const root = window.document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      return;
    }

    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, [isDark]);

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem(SESSION_STORAGE_KEY);

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
      } catch {
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
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const toggleTheme = () => setIsDark((value) => !value);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-500 dark:text-slate-400">
        正在验证登录状态...
      </div>
    );
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <Header isDark={isDark} onToggleTheme={toggleTheme} user={user} />
        <main className="flex-1 overflow-x-hidden pb-24">
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginView onLogin={handleLogin} />} />
            <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterView />} />
            <Route path="/" element={user ? <HomeView insights={insights} /> : <Navigate to="/login" replace />} />
            <Route path="/live" element={user ? <LiveView /> : <Navigate to="/login" replace />} />
            <Route
              path="/ai"
              element={
                user && authToken
                  ? <AIView authToken={authToken} gardenApiKey={gardenApiKey} gardenBaseUrl={gardenBaseUrl} setInsights={setInsights} />
                  : <Navigate to="/login" replace />
              }
            />
            <Route path="/robot" element={user ? <RobotView /> : <Navigate to="/login" replace />} />
            <Route
              path="/settings"
              element={
                user && authToken ? (
                  <SettingsView
                    user={user}
                    authToken={authToken}
                    gardenApiKey={gardenApiKey}
                    gardenBaseUrl={gardenBaseUrl}
                    onGardenApiKeyChange={setGardenApiKey}
                    onGardenBaseUrlChange={setGardenBaseUrl}
                    onLogout={handleLogout}
                    onUserUpdate={handleUserUpdate}
                  />
                ) : <Navigate to="/login" replace />
              }
            />
            <Route path="/all-activities" element={user ? <AllActivitiesView insights={insights} /> : <Navigate to="/login" replace />} />
          </Routes>
        </main>
        <Navigation />
      </div>
    </Router>
  );
};

export default App;
